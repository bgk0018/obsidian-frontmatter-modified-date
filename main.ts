import { App, Plugin, PluginSettingTab, Setting, TFile, moment } from 'obsidian'

interface FrontmatterModifiedSettings {
  frontmatterProperty: string;
  momentFormat: string;
  excludedFolders: string[];
}

const DEFAULT_SETTINGS: FrontmatterModifiedSettings = {
  frontmatterProperty: 'modified',
  momentFormat: '',
  excludedFolders: []
}

interface FileStatus {
  timeout: number;
  processed: boolean;
}

const DEFAULT_STATUS: FileStatus = {
  timeout: 0,
  processed: false
}

export default class FrontmatterModified extends Plugin {
  settings: FrontmatterModifiedSettings
  fileStatus: { [key: string]: FileStatus } = {}

  async onload () {
    await this.loadSettings()

    this.registerEvent(this.app.vault.on('modify', (file) => {
      /*
      Use a timeout to update the metadata only once the user has stopped typing.
      If the user keeps typing, then it will reset the timeout and start again from zero.

      Obsidian doesn't appear to correctly handle this situation otherwise, and pops an
      error to say "<File> has been modified externally, merging changes automatically."
      */
      if (file instanceof TFile && !this.settings.excludedFolders.some(folder => file.path.startsWith(folder + '/'))) {
        if (!this.fileStatus[file.path]) {
          this.fileStatus[file.path] = DEFAULT_STATUS
        }
        if (!this.fileStatus[file.path].processed) {
          clearTimeout(this.fileStatus[file.path].timeout)
          this.fileStatus[file.path].timeout = window.setTimeout(() => {
            this.app.fileManager.processFrontMatter(file, (frontmatter) => {
              frontmatter[this.settings.frontmatterProperty] = moment().format(this.settings.momentFormat)
              // When we update the frontmatter with processFrontMatter(), it fires off a second
              // 'modify' event. Adding this de-duplication ensures we process it just once.
              this.fileStatus[file.path].processed = true
            })
          }, 10 * 1000)
        } else {
          // This file has already had the frontmatter updated, and is now experiencing
          // the second duplicate 'modify' event due to using processFrontMatter()
          this.fileStatus[file.path].processed = false
        }
      }
    }))

    this.addSettingTab(new FrontmatterModifiedSettingTab(this.app, this))
  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    await this.saveData(this.settings)
  }
}

class FrontmatterModifiedSettingTab extends PluginSettingTab {
  plugin: FrontmatterModified

  constructor (app: App, plugin: FrontmatterModified) {
    super(app, plugin)
    this.plugin = plugin
  }

  display (): void {
    const { containerEl } = this

    containerEl.empty()

    // Frontmatter property setting
    new Setting(containerEl)
      .setName('Frontmatter property')
      .setDesc('The name of the YAML/frontmatter property to update')
      .addText(text => text
        .setPlaceholder('modified')
        .setValue(this.plugin.settings.frontmatterProperty)
        .onChange(async (value) => {
          this.plugin.settings.frontmatterProperty = value
          await this.plugin.saveSettings()
        }))

    // Date format setting
    new Setting(containerEl)
      .setName('Date format')
      .setDesc('This is in MomentJS format. Leave blank for the default ATOM format.')
      .addText(text => text
        .setPlaceholder('ATOM format')
        .setValue(this.plugin.settings.momentFormat)
        .onChange(async (value) => {
          this.plugin.settings.momentFormat = value
          await this.plugin.saveSettings()
        }))

    // Exclude folders
    new Setting(containerEl)
      .setName('Exclude folders')
      .setDesc('Add a list of folders to exclude, one folder per line. All subfolders will be also excluded.')
      .addTextArea(text => text
        .setValue(this.plugin.settings.excludedFolders.join('\n'))
        .onChange(async (value) => {
          this.plugin.settings.excludedFolders = value.split('\n').map(x => x.trim()).filter(x => !!x)
          await this.plugin.saveSettings()
        }))
  }
}