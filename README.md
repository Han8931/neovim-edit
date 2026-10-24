# NeoVim Integration for Obsidian

This plugin lets you open the note you're currently viewing in Obsidian directly in Neovim, combining Neovim's editing power with Obsidian's note-taking and knowledge management.

## Features

- **One keystroke handoff:** Open the active note in Neovim from the command palette or a hotkey.
- **Works with any terminal:** Configure the launch command from the settings tab — no need to edit source.
- **Safe with any filename:** Notes with apostrophes, spaces, or shell metacharacters in the title are passed through untouched.

## Installation

1. Clone this repo into `<vault>/.obsidian/plugins/neovim-edit/`.
2. Enable **neovim-edit** under Settings → Community plugins.

## Usage

1. Open the note you want to edit.
2. Run **Open current note in Neovim** from the command palette, or press `Ctrl+Alt+O`.
3. Edit and save in Neovim. Obsidian picks the change up from disk.

> If the note is also open in an Obsidian editor pane, prefer closing that pane before editing externally — otherwise Obsidian's autosave can write its own buffer back over what Neovim saved.

## Configuration

Open **Settings → neovim-edit**. The *launch command* describes how to start your terminal, with `{{file}}` standing in for the note's absolute path:

```
st -e nvim {{file}}
```

Presets are available for st, alacritty, kitty, wezterm, foot, ghostty, gnome-terminal, konsole, and xterm on Linux; Terminal.app and iTerm2 on macOS; and Windows Terminal and cmd on Windows.

The command is **not** run through a shell — it is split into arguments and executed directly. That means:

- Do not quote `{{file}}`; the path is passed as a single argument no matter what it contains.
- Shell features (pipes, `&&`, variable expansion, globbing) are not available. To use them, invoke a shell explicitly: `sh -c '…'`.
- Quotes and backslashes in the command itself follow the usual shell-style rules, so `'…'` groups an argument containing spaces.

The command is stored per platform, so a vault synced between Linux and macOS keeps a working command on each.

### Troubleshooting

If you get *"… was not found"*, the terminal or `nvim` isn't on the `PATH` that Obsidian inherits. Launching Obsidian from a desktop menu often yields a more minimal `PATH` than your shell has. Use an absolute path in the launch command to rule this out.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
