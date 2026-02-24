import { helix} from 'codemirror-helix';
import { Extension, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_EDITOR_VIEW, DEFAULT_SETTINGS, HelixSettings } from 'src/logic';

// Keys that Helix does not handle in Normal/Select mode but that Obsidian would
// act on if not suppressed, corrupting editor state and the Helix undo history.
// Add any newly discovered passthrough keys here.
const UNHANDLED_KEYS: ReadonlySet<string> = new Set([
    'Backspace',
    'Enter',
]);

// Modifier+key combos to suppress in the same modes.
// Each entry is matched when ALL listed modifiers are present (others are ignored).
const UNHANDLED_COMBOS: ReadonlyArray<{ key: string; ctrl?: boolean; meta?: boolean; alt?: boolean }> = [
    { key: 'z', ctrl: true }, // Ctrl+Z / Ctrl+Alt+Z — Obsidian undo, bypasses Helix history
];

function isUnhandledCombo(event: KeyboardEvent): boolean {
    return UNHANDLED_COMBOS.some(combo =>
        event.key === combo.key &&
        (combo.ctrl  === undefined || event.ctrlKey  === combo.ctrl) &&
        (combo.meta  === undefined || event.metaKey  === combo.meta) &&
        (combo.alt   === undefined || event.altKey   === combo.alt)
    );
}

export default class HelixPlugin extends Plugin {
    settings: HelixSettings;
    extensions: Extension[];

    async onload() {
        await this.loadSettings();
        this.extensions = [];
        this.addSettingTab(new HelixSettingsTab(this.app, this));
        await this.setEnabled(this.settings.enableHelixKeybindings, false);
        this.registerEditorExtension(this.extensions);
        this.addCommand({
            id: "toggle-keybindings",
            name: "Toggle helix mode",
            callback: async () => this.setEnabled(!this.settings.enableHelixKeybindings, true, true),
        });
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as HelixSettings;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async setEnabled(value: boolean, reload: boolean = true, print: boolean = false) {
        this.settings.enableHelixKeybindings = value;
        this.extensions.length = 0;

        if (value) {
            this.extensions.push(Prec.high(DEFAULT_EDITOR_VIEW));
            this.extensions.push(Prec.high(helix({
                config: {
                    "editor.cursor-shape.insert": this.settings.cursorInInsertMode,
                }
            })));

// Runs before all other handlers. In Normal/Select mode, Obsidian must
// not see keys that Helix leaves unhandled — doing so corrupts state.
// cm-hx-block-cursor is added by codemirror-helix to scrollDOM in Normal/Select
// mode and removed in Insert mode, giving us a reliable proxy for the current mode.
this.extensions.push(Prec.highest(
    EditorView.domEventHandlers({
        keydown(event: KeyboardEvent, view: EditorView) {
            const isNormalOrSelect = view.scrollDOM.classList.contains('cm-hx-block-cursor');
            if (!isNormalOrSelect) return false;

            if (UNHANDLED_KEYS.has(event.key) || isUnhandledCombo(event)) {
                event.preventDefault();
                event.stopPropagation();
                return true;
            }

            return false;
        }
    })
));
        }

        await this.saveSettings();
        if (reload) this.app.workspace.updateOptions();
        if (print) {
            const msg = value ? "Enabled" : "Disabled";
            new Notice(`${msg} Helix keybindings`);
        }
    }

    async reload() {
        await this.setEnabled(this.settings.enableHelixKeybindings);
    }
}

class HelixSettingsTab extends PluginSettingTab {
    plugin: HelixPlugin;

    constructor(app: App, plugin: HelixPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("p", { text: "Vim keybindings must be disabled for the plugin to work" });

        new Setting(containerEl)
            .setName('Enable helix mode')
            .addToggle(async (value) => {
                value
                    .setValue(this.plugin.settings.enableHelixKeybindings)
                    .onChange(async (value) => this.plugin.setEnabled(value))
            });

        new Setting(containerEl)
            .setName('Cursor in insert mode')
            .addDropdown(dropDown => {
                dropDown.addOption('block', 'Block');
                dropDown.addOption('bar', 'Bar');
                dropDown.setValue(this.plugin.settings.cursorInInsertMode)
                dropDown.onChange(async (value) => {
                    if (value == "block" || value == "bar") {
                        this.plugin.settings.cursorInInsertMode = value;
                        await this.plugin.saveSettings();
                        await this.plugin.reload();
                    }
                });
            });
    }
}
