const {
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	FileSystemAdapter,
} = require("obsidian");
const { spawn } = require("child_process");
const os = require("os");

// Command templates are tokenized into an argv array *before* {{file}} is
// substituted, then handed to spawn() without a shell. A note path can
// therefore never split into extra arguments or be interpreted as shell
// syntax, no matter what characters it contains.
const PRESETS = {
	linux: {
		"st": "st -e nvim {{file}}",
		"alacritty": "alacritty -e nvim {{file}}",
		"kitty": "kitty nvim {{file}}",
		"wezterm": "wezterm start -- nvim {{file}}",
		"foot": "foot nvim {{file}}",
		"ghostty": "ghostty -e nvim {{file}}",
		"gnome-terminal": "gnome-terminal -- nvim {{file}}",
		"konsole": "konsole -e nvim {{file}}",
		"xterm": "xterm -e nvim {{file}}",
	},
	darwin: {
		// `quoted form of` is AppleScript's shell quoting, applied to the path
		// after osascript has received it as a plain argv entry.
		"Terminal.app":
			"osascript -e 'on run argv' -e 'tell app \"Terminal\" to do script (\"nvim \" & quoted form of item 1 of argv)' -e 'end run' {{file}}",
		"iTerm2":
			"osascript -e 'on run argv' -e 'tell app \"iTerm\" to create window with default profile command (\"nvim \" & quoted form of item 1 of argv)' -e 'end run' {{file}}",
	},
	win32: {
		"Windows Terminal": "wt nvim {{file}}",
		"cmd": "cmd /c start \"\" nvim {{file}}",
	},
};

const DEFAULT_PRESET = {
	linux: "st",
	darwin: "Terminal.app",
	win32: "Windows Terminal",
};

function defaultTemplate(platform) {
	const presets = PRESETS[platform];
	if (!presets) return "";
	return presets[DEFAULT_PRESET[platform]] || "";
}

/**
 * Split a command template into argv, honouring single quotes, double quotes
 * and backslash escapes. Throws on an unterminated quote so the user gets a
 * real error instead of a silently mangled command.
 */
function tokenize(template) {
	const tokens = [];
	let current = "";
	let quote = null;
	let started = false;

	for (let i = 0; i < template.length; i++) {
		const ch = template[i];

		if (quote) {
			if (ch === quote) quote = null;
			else current += ch;
			continue;
		}
		if (ch === "'" || ch === '"') {
			quote = ch;
			started = true;
			continue;
		}
		// Escape only what actually needs escaping, so Windows paths typed into
		// a template (C:\Program Files\nvim.exe) keep their separators.
		if (ch === "\\" && i + 1 < template.length && /['"\s\\]/.test(template[i + 1])) {
			current += template[++i];
			started = true;
			continue;
		}
		if (/\s/.test(ch)) {
			if (started) {
				tokens.push(current);
				current = "";
				started = false;
			}
			continue;
		}
		current += ch;
		started = true;
	}

	if (quote) throw new Error(`unbalanced ${quote} quote`);
	if (started) tokens.push(current);
	return tokens;
}

function substitute(tokens, vars) {
	return tokens.map((token) =>
		token.replace(/\{\{(\w+)\}\}/g, (match, key) =>
			Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
		)
	);
}

const DEFAULT_SETTINGS = {
	// Keyed by platform so a vault synced between machines keeps a working
	// command on each one.
	templates: {},
};

class NeovimEditPlugin extends Plugin {
	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "open-in-neovim",
			name: "Open current note in Neovim",
			hotkeys: [
				{
					modifiers: ["Ctrl", "Alt"],
					key: "o",
				},
			],
			callback: () => this.openInTerminal(),
		});

		this.addSettingTab(new NeovimEditSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (!this.settings.templates) this.settings.templates = {};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	currentTemplate() {
		const platform = os.platform();
		const stored = this.settings.templates[platform];
		return stored !== undefined ? stored : defaultTemplate(platform);
	}

	openInTerminal() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Neovim: no note is currently open.");
			return;
		}

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice("Neovim: this vault is not stored on the local filesystem.");
			return;
		}
		const filePath = adapter.getFullPath(activeFile.path);
		const vaultRoot = adapter.getBasePath();

		const template = this.currentTemplate();
		if (!template.trim()) {
			new Notice(
				`Neovim: no launch command configured for ${os.platform()}. Set one in the plugin settings.`
			);
			return;
		}

		let argv;
		try {
			argv = substitute(tokenize(template), { file: filePath });
		} catch (error) {
			new Notice(`Neovim: invalid launch command — ${error.message}`);
			return;
		}

		if (!argv.length) {
			new Notice("Neovim: launch command is empty.");
			return;
		}
		if (!template.includes("{{file}}")) {
			new Notice("Neovim: launch command is missing the {{file}} placeholder.");
			return;
		}

		let child;
		try {
			child = spawn(argv[0], argv.slice(1), {
				cwd: vaultRoot,
				detached: true,
				stdio: "ignore",
			});
		} catch (error) {
			new Notice(`Neovim: could not launch ${argv[0]} — ${error.message}`);
			return;
		}

		child.on("error", (error) => {
			if (error.code === "ENOENT") {
				new Notice(
					`Neovim: "${argv[0]}" was not found. Check the command in the plugin settings, ` +
						`and note that Obsidian may not inherit your shell's PATH.`
				);
			} else {
				new Notice(`Neovim: could not launch ${argv[0]} — ${error.message}`);
			}
		});

		// Only surface an early failure. A non-zero exit long after launch is
		// usually the user quitting Neovim deliberately (`:cq`), not an error.
		const launchedAt = Date.now();
		child.on("exit", (code) => {
			if (code && Date.now() - launchedAt < 2000) {
				new Notice(`Neovim: ${argv[0]} exited immediately with code ${code}.`);
			}
		});

		// Let the terminal outlive Obsidian rather than dying with it.
		child.unref();
	}
}

class NeovimEditSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		const platform = os.platform();
		const presets = PRESETS[platform];

		if (!presets) {
			containerEl.createEl("p", {
				text:
					`Platform "${platform}" has no built-in presets. Enter a launch command below; ` +
					`it must contain {{file}}.`,
			});
		}

		new Setting(containerEl)
			.setName("Launch command")
			.setDesc(
				"How to open the note. Use {{file}} where the note's absolute path should go. " +
					"The command is run directly, not through a shell, so quoting the placeholder " +
					`is unnecessary. This setting applies to ${platform} only.`
			)
			.addTextArea((text) => {
				text.inputEl.rows = 3;
				text.inputEl.style.width = "100%";
				text
					.setPlaceholder(defaultTemplate(platform))
					.setValue(this.plugin.currentTemplate())
					.onChange(async (value) => {
						this.plugin.settings.templates[platform] = value;
						await this.plugin.saveSettings();
					});
			});

		if (presets) {
			new Setting(containerEl)
				.setName("Use a preset")
				.setDesc("Fill the launch command with a known-good template for a terminal.")
				.addDropdown((dropdown) => {
					dropdown.addOption("", "Select a terminal…");
					for (const name of Object.keys(presets)) dropdown.addOption(name, name);
					dropdown.setValue("");
					dropdown.onChange(async (name) => {
						if (!name) return;
						this.plugin.settings.templates[platform] = presets[name];
						await this.plugin.saveSettings();
						this.display();
					});
				});
		}

		new Setting(containerEl)
			.setName("Restore default")
			.setDesc(`Reset the launch command to the ${platform} default.`)
			.addButton((button) =>
				button.setButtonText("Restore").onClick(async () => {
					delete this.plugin.settings.templates[platform];
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}
}

module.exports = NeovimEditPlugin;
