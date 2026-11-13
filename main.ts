import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  moment,
  requestUrl,
} from "obsidian";

interface CaptureSettings {
  dailyNoteFolder: string;
  dailyNoteFormat: string;
  headings: string;
  defaultHeading: string;
  useAI: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  template: string;
}

const DEFAULT_SETTINGS: CaptureSettings = {
  dailyNoteFolder: "",
  dailyNoteFormat: "YYYY-MM-DD",
  headings: "Tasks, Ideas, Notes",
  defaultHeading: "Notes",
  useAI: false,
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  template: "",
};

interface AIResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

export default class SmartDailyCapture extends Plugin {
  settings: CaptureSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "open-capture",
      name: "Capture to daily note",
      callback: () => this.openCapture(),
    });

    this.addRibbonIcon("edit", "Capture to daily note", () => this.openCapture());

    this.addSettingTab(new CaptureSettingTab(this.app, this));
  }

  openCapture() {
    new CaptureModal(this.app, this).open();
  }

  getHeadingList(): string[] {
    return this.settings.headings
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async getOrCreateDailyNote(): Promise<TFile> {
    const date = moment().format(this.settings.dailyNoteFormat);
    const folder = this.settings.dailyNoteFolder.trim();
    const path = folder ? `${folder}/${date}.md` : `${date}.md`;

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;

    const content = this.settings.template
      ? this.settings.template.replace(/\{\{date\}\}/g, date)
      : `# ${date}\n\n`;

    return this.app.vault.create(path, content);
  }

  async appendUnderHeading(file: TFile, heading: string, text: string) {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const headingLine = `## ${heading}`;
    let insertAt = lines.length;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === headingLine) {
        found = true;
        insertAt = i + 1;
        while (insertAt < lines.length && !lines[insertAt].startsWith("## ")) {
          insertAt++;
        }
        break;
      }
    }

    const entry = `- ${text}`;
    if (found) {
      lines.splice(insertAt, 0, entry);
    } else {
      lines.push("", headingLine, entry);
    }

    await this.app.vault.modify(file, lines.join("\n"));
  }

  async classify(text: string): Promise<string | null> {
    if (!this.settings.useAI || !this.settings.apiKey) return null;

    const headings = this.getHeadingList();
    const response = await requestUrl({
      url: `${this.settings.baseUrl}/chat/completions`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.apiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages: [
          {
            role: "user",
            content: `Classify this note into exactly one of these headings: ${headings.join(", ")}. Reply with only the heading name.\n\n${text}`,
          },
        ],
        temperature: 0,
      }),
    });

    if (response.status !== 200) return null;
    const data = response.json as AIResponse;
    const reply = data.choices?.[0]?.message?.content?.trim() || "";
    const match = headings.find((h) => h.toLowerCase() === reply.toLowerCase());
    return match || null;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class CaptureModal extends Modal {
  private inputEl: HTMLTextAreaElement;
  private selectEl: HTMLSelectElement;

  constructor(app: App, private plugin: SmartDailyCapture) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("smart-capture-modal");
    contentEl.createEl("h2", { text: "Capture", cls: "modal-title" });

    this.inputEl = contentEl.createEl("textarea", { cls: "capture-input" });
    this.inputEl.placeholder = "Type your thought…";

    this.selectEl = contentEl.createEl("select", { cls: "heading-select" });
    const headings = this.plugin.getHeadingList();
    for (const h of headings) {
      const opt = this.selectEl.createEl("option", { text: h, value: h });
      if (h === this.plugin.settings.defaultHeading) opt.selected = true;
    }

    const buttonRow = contentEl.createDiv({ cls: "modal-button-row" });

    const classifyBtn = buttonRow.createEl("button", { text: "Classify" });
    classifyBtn.onclick = () => void this.doClassify();

    const saveBtn = buttonRow.createEl("button", { text: "Save" });
    saveBtn.onclick = () => void this.doSave();

    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    this.inputEl.focus();
  }

  private async doClassify() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    new Notice("Classifying…");
    const heading = await this.plugin.classify(text);
    if (heading) {
      this.selectEl.value = heading;
      new Notice(`Suggested: ${heading}`);
    } else {
      new Notice("Could not classify");
    }
  }

  private async doSave() {
    const text = this.inputEl.value.trim();
    if (!text) {
      new Notice("Nothing to save");
      return;
    }
    const heading = this.selectEl.value;
    try {
      const file = await this.plugin.getOrCreateDailyNote();
      await this.plugin.appendUnderHeading(file, heading, text);
      new Notice(`Saved under ${heading}`);
      this.close();
    } catch (e) {
      new Notice("Failed to save");
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CaptureSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SmartDailyCapture) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Daily note folder")
      .setDesc("Leave empty for vault root")
      .addText((text) =>
        text
          .setPlaceholder("Daily")
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Date format")
      .setDesc("Moment.js format for the daily note filename")
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD")
          .setValue(this.plugin.settings.dailyNoteFormat)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFormat = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Headings")
      .setDesc("Comma-separated headings to file under")
      .addText((text) =>
        text
          .setPlaceholder("Tasks, Ideas, Notes")
          .setValue(this.plugin.settings.headings)
          .onChange(async (value) => {
            this.plugin.settings.headings = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default heading")
      .addText((text) =>
        text
          .setPlaceholder("Notes")
          .setValue(this.plugin.settings.defaultHeading)
          .onChange(async (value) => {
            this.plugin.settings.defaultHeading = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily note template")
      .setDesc("Use {{date}} as a placeholder. Leave empty for a simple title.")
      .addTextArea((text) =>
        text
          .setPlaceholder("# {{date}}\n\n## Tasks\n\n## Ideas\n\n## Notes")
          .setValue(this.plugin.settings.template)
          .onChange(async (value) => {
            this.plugin.settings.template = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Use AI classification")
      .setDesc("Classify captures into headings with an API")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.useAI).onChange(async (v) => {
          this.plugin.settings.useAI = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("API Key")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Base URL")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
