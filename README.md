# ![Extension Icon](images/icon128.png) Calm the Chaos - Preview
### v0.1.0-preview

> ⚠️ **Official Preview Release**: This is the official preview ersion of Calm the Chaos. Features may be incomplete or subject to change.

## 🌟 Overview

A browser extension that filters unwanted content across every website.

(Total preview version, I mostly tested my most visited websites.)

### Filtered Categories

The extension filters content based on the following categories:

| Category | Description |
|----------|-------------|
| Education | Topics related to educational policies, practices, and institutions |
| Environment and Climate Change | Topics related to climate change, natural disasters, and environmental issues |
| Financial/Economic | Terms associated with market trends, economic conditions, and financial jargon |
| Gun Rights | Keywords related to gun control, rights, and legislation |
| Immigration | Topics related to immigration policies, practices, and debates |
| International Political Figures | Names of prominent political figures from around the world |
| International Relations | Topics related to global conflicts, diplomacy, and international policies |
| LGBTQ | Keywords related to LGBTQ rights, identities, and issues |
| Media Figures | Names of influential media personalities |
| Other | Miscellaneous keywords covering conspiracy theories, government control, and other controversial topics |
| Political and Government | Keywords related to political ideologies, government policies, and political events |
| Political Ideologies | Terms associated with various political ideologies and movements |
| Race Relations | Topics related to racial equality, justice, and issues |
| Reproductive Health | Keywords related to reproductive rights and health |
| Social Issues | Terms associated with social justice, cultural debates, and societal challenges |
| Technology | Keywords related to tech platforms, digital trends, and online behaviors |
| US Political Figures | Notable political figures in the United States |
| Vaccine Controversies | Keywords related to vaccine debates and controversies |
| Violence and Extremism | Terms related to violent acts, extremism, and security threats |

### 🌍 Regional Customization

While the default keywords are US-centric, you can easily maintain your own regional keyword list:

1. Create a plain text file with your keywords (one per line), for example:
   ```
   keyword1
   keyword2
   keyword3
   ```

2. Host this file anywhere on the web (e.g., GitHub Gist, Pastebin)
3. In the extension settings:
   - Go to the "Import/Export" tab
   - Paste your URL in the "Enter URL to import settings" field
   - Click "Import from URL"
4. Enable "Check for new keywords on startup" to automatically update your keywords when you start your browser

## ✨ Features

- **🔍 Customizable Filtering**: Tailor your browsing experience by defining custom keywords and keyword groups.
- **🌐 Platform Support**: Seamlessly integrates with Reddit, Facebook, Twitter, Instagram, LinkedIn, YouTube, CNN, StackOverflow, and Bluesky.
- **🔄 Flexible Matching**: Choose between exact and flexible matching to refine content identification.
- **🔒 Domain Control**: Enable or disable filtering for specific domains to match your browsing habits.

## 🚀 Installation

1. **Clone or Download**: Get this repository on your local machine.
2. **Open Chrome Extensions**: Navigate to `chrome://extensions/`.
3. **Enable Developer Mode**: Toggle the switch in the top right corner.
4. **Load Unpacked**: Click and select the directory where this extension is located.

## 🛠️ Usage

Once installed, the extension works automatically based on your settings. Customize these settings through the `options.html` page, accessible from the extension's icon in the Chrome toolbar.

## 👩‍💻 Developer Guide

### Introduction

This extension is built for flexibility and extensibility, allowing developers to easily integrate new platforms and customize filtering criteria.

### Key Components

- **contentFilter.js**: Core logic for content identification and blocking.
- **regexManager.js**: Manages regex patterns and supports flexible and exact matching.
- **utils.js**: Utility functions for regex handling and Chrome API interactions.

## 🤝 Contributing

Contributions are welcomed, especially if you have extra websites to filter.

1. **Fork the Repository**: Create your own copy.
2. **Create a Branch**: For your feature or bugfix.
3. **Make Changes**: Ensure they are well-tested.
4. **Submit a Pull Request**: With a detailed description of your changes.

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
