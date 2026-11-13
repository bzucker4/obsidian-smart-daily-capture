# Smart Daily Capture

Quickly capture a thought and file it into today's daily note under the right heading.

[![Sponsor](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=%23EA4AAA)](https://github.com/sponsors/bzucker4)

## Features

- Command and ribbon icon: **Capture to daily note**
- Appends under a chosen heading (creates the daily note if needed)
- Configurable headings, date format, and folder
- Optional AI classification into headings
- Simple template support with `{{date}}`

## Setup

1. Build: `npm install && npm run build`
2. Copy the folder into `.obsidian/plugins/`
3. Enable the plugin
4. Set your daily note folder and headings in settings
5. Use the command or ribbon icon to capture

## Privacy

In default mode, nothing leaves your vault. If you enable AI classification, the capture text is sent to the endpoint you configure.

## License

MIT
