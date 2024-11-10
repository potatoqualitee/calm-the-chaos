# ![Extension Icon](images/icon128.png) Calm the Chaos

## 🌟 Overview

A browser extension that filters unwanted content across every website.

(Total alpha version, I mostly tested my most visited websites.)

### Unwanted Content Categories

The extension filters content based on the following categories:

- **Environmental**: Topics related to climate change, natural disasters, and environmental issues.
- **Financial/Economic**: Terms associated with market trends, economic conditions, and financial jargon.
- **International Political Figures**: Names of prominent political figures from around the world.
- **International Relations**: Topics related to global conflicts, diplomacy, and international policies.
- **Media and Business Figures**: Names of influential media personalities and business leaders.
- **Political and Government**: Keywords related to political ideologies, government policies, and political events.
- **Social Issues**: Terms associated with social justice, cultural debates, and societal challenges.
- **Technology**: Keywords related to tech platforms, digital trends, and online behaviors.
- **US Political Figures**: Names of notable political figures in the United States.
- **Violence and Extremism**: Terms related to violent acts, extremism, and security threats.
- **Other**: Miscellaneous keywords covering conspiracy theories, government control, and other controversial topics.

### 🌍 US-Centric Focus

While this extension is tailored for a US-centric audience, its flexible design allows you to expand its capabilities to suit other regions or personal preferences.

## ✨ Features

- **🔍 Customizable Filtering**: Tailor your browsing experience by defining custom keywords and keyword groups.
- **🌐 Platform Support**: Seamlessly integrates with Reddit, Facebook, Twitter, Instagram, LinkedIn, YouTube, CNN, StackOverflow, and Bluesky.
- **🔄 Flexible Matching**: Choose between exact, flexible, and fuzzy matching to refine content identification.
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
- **regexManager.js**: Manages regex patterns and supports flexible and fuzzy matching.
- **utils.js**: Utility functions for regex handling and Chrome API interactions.

### Extending the Extension

Developers can enhance functionality by adding new platform handlers or modifying existing logic to meet diverse requirements.

## 🤝 Contributing

We welcome contributions from the community! To contribute:

1. **Fork the Repository**: Create your own copy.
2. **Create a Branch**: For your feature or bugfix.
3. **Make Changes**: Ensure they are well-tested.
4. **Submit a Pull Request**: With a detailed description of your changes.

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
