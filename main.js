const { Plugin } = require("obsidian");
const { exec } = require("child_process");
const os = require("os");
const path = require("path");

class TerminalPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: "neovim-edit",
			name: "neovim-edit",
			hotkeys: [
			  {
				modifiers: ["Ctrl", "Alt"], // Use "Mod" instead of "Ctrl" if you want it to work as "Cmd" on macOS and "Ctrl" on Windows/Linux.
				key: "o",
			  },
			],
			callback: () => {
				this.openInTerminal();
			},
		});
	}

	openInTerminal() {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			// const filePath = activeFile.path;
			const filePath = path.join(this.app.vault.adapter.basePath, activeFile.path);
			let terminalCommand;
			switch (os.platform()) {
				case "darwin": // macOS
					terminalCommand = `osascript -e 'tell app "Terminal" to do script "nvim ${filePath}"'`;
					break;
				case "win32": // Windows
					// Adjust accordingly for PowerShell and Neovim
					terminalCommand = `powershell -NoProfile -Command "Start-Process nvim -ArgumentList '${filePath}'"`;
					break; 
				case "linux":
					// Replace 'gnome-terminal' with 'st' for Simple Terminal
					terminalCommand = `st -e nvim '${filePath}'`;
					break;

				default:
					console.error("Unsupported platform");
					return;
			}

			exec(terminalCommand, (error, stdout, stderr) => {
				if (error) {
					console.error(`exec error: ${error}`);
					return;
				}
				console.log(`stdout: ${stdout}`);
				console.error(`stderr: ${stderr}`);
			});
		} else {
			console.log("No active file found.");
		}
	}

	onunload() {
		// Clean up any event listeners or other resources
	}
}

module.exports = TerminalPlugin;

