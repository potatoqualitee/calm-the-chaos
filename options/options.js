// options.js
import { DEFAULT_IGNORED_URLS } from '../scripts/core/config/ignoredUrls.js';
import { DEFAULT_KEYWORD_GROUPS } from '../scripts/core/config/keywords.js';
import { DEFAULT_ELEMENT_GROUPS, DEFAULT_ELEMENT_SETTINGS } from '../scripts/core/config/elements.js';
import { initializeRegex } from '../scripts/core/managers/regexManager.js';
import * as ui from './optionsUI.js';
import * as storage from './optionsStorage.js';
import { setupFilter, setupTabs, setupEventListeners } from './optionsEvents.js';

// Initialize the settings
export async function initializeSettings() {
  try {
    console.log('Starting initialization...');
    const result = await storage.getStorageData([
      'ignoredDomains',
      'keywordGroups',
      'customKeywords',
      'customDomains',
      'disabledGroups',
      'disabledKeywords',
      'disabledDomainGroups',
      'disabledDomains',
      'elementGroups',
      'disabledElementGroups',
      'disabledElements',
      'matchingOption',
      'configUrls',
      'checkForUpdates',
      'filteringEnabled',
      'collapseStyle',
      'imageFilteringEnabled',
      'imageContext',
      'imageContainerStyle',
      'filterRedditCommentThreads',
      'filterFacebookCommentThreads',
      'showBlurMessage',
      'allTimeKeywordStats'
    ]);

    console.log('Initial storage data:', result);

    // Initialize domains
    let ignoredDomains = result.ignoredDomains;
    if (!ignoredDomains) {
      ignoredDomains = DEFAULT_IGNORED_URLS;
      await storage.setStorageData({ ignoredDomains });
      console.log('Initialized ignoredDomains with defaults');
    }

    // Initialize filtering mode (disabled by default)
    let filteringEnabled = result.filteringEnabled !== undefined ? result.filteringEnabled : false;
    await storage.setStorageData({ filteringEnabled });

    // Initialize keyword groups
    let keywordGroups = result.keywordGroups;
    if (!keywordGroups) {
      keywordGroups = DEFAULT_KEYWORD_GROUPS;
      await storage.setStorageData({ keywordGroups });
      console.log('Initialized keywordGroups with defaults:', keywordGroups);
    }

    // Initialize element groups
    let elementGroups = result.elementGroups;
    if (!elementGroups) {
      elementGroups = DEFAULT_ELEMENT_GROUPS;
      await storage.setStorageData({ elementGroups });
      console.log('Initialized elementGroups with defaults');
    }

    // Initialize Reddit settings
    let filterRedditCommentThreads = result.filterRedditCommentThreads !== undefined ?
      result.filterRedditCommentThreads :
      DEFAULT_ELEMENT_SETTINGS.filterRedditCommentThreads;
    await storage.setStorageData({ filterRedditCommentThreads });

    // Initialize Facebook settings
    let filterFacebookCommentThreads = result.filterFacebookCommentThreads !== undefined ?
      result.filterFacebookCommentThreads :
      DEFAULT_ELEMENT_SETTINGS.filterFacebookCommentThreads;
    await storage.setStorageData({ filterFacebookCommentThreads });

    // Initialize blur message settings
    let showBlurMessage = result.showBlurMessage !== undefined ?
      result.showBlurMessage :
      DEFAULT_ELEMENT_SETTINGS.showBlurMessage;
    await storage.setStorageData({ showBlurMessage });

    // Initialize image filtering settings
    let imageFilteringEnabled = result.imageFilteringEnabled !== undefined ? result.imageFilteringEnabled : true;
    let imageContext = result.imageContext || {
      altText: true,
      captions: true,
      nearbyText: true,
      srcUrl: true
    };
    let imageContainerStyle = result.imageContainerStyle || 'hideImage';

    // Initialize other settings
    let customKeywords = result.customKeywords || [];
    let customDomains = result.customDomains || [];
    let disabledGroups = result.disabledGroups || [];
    let disabledKeywords = result.disabledKeywords || [];
    let disabledDomainGroups = result.disabledDomainGroups || [];
    let disabledDomains = result.disabledDomains || [];
    let disabledElementGroups = result.disabledElementGroups || [];
    let disabledElements = result.disabledElements || [];
    let matchingOption = result.matchingOption !== undefined ? result.matchingOption : 'flexible';
    let configUrls = result.configUrls || [];
    let checkForUpdates = result.checkForUpdates !== undefined ? result.checkForUpdates : true;
    let collapseStyle = result.collapseStyle || 'hideCompletely';

    // Initialize allTimeKeywordStats if not present
    const allTimeKeywordStats = result.allTimeKeywordStats || {};

    // Sort custom items alphabetically
    customKeywords.sort();
    customDomains.sort();
    configUrls.sort();

    console.log('Saving all settings...');
    await storage.setStorageData({
      customKeywords,
      customDomains,
      disabledGroups,
      disabledKeywords,
      disabledDomainGroups,
      disabledDomains,
      disabledElementGroups,
      disabledElements,
      matchingOption,
      configUrls,
      checkForUpdates,
      collapseStyle,
      imageFilteringEnabled,
      imageContext,
      imageContainerStyle,
      filterRedditCommentThreads,
      showBlurMessage,
      allTimeKeywordStats
    });

    console.log('Updating UI...');
    console.log('Keyword groups:', keywordGroups);
    console.log('Custom keywords:', customKeywords);
    console.log('Disabled groups:', disabledGroups);
    console.log('Disabled keywords:', disabledKeywords);
    console.log('Config URLs:', configUrls);

    // Update UI elements
    ui.updateDomainGroups(ignoredDomains, disabledDomainGroups, disabledDomains, filteringEnabled, customDomains);
    ui.updateKeywordGroups(keywordGroups, customKeywords, disabledGroups, disabledKeywords);
    ui.updateElementGroups(elementGroups, disabledElementGroups, disabledElements);
    ui.updateFilteringModeText(filteringEnabled);
    ui.updateConfigUrls(configUrls);
    ui.updateStats();

    // Update form elements
    const matchingOptionInput = document.querySelector(`input[name="matchingOptions"][value="${matchingOption}"]`);
    if (matchingOptionInput) matchingOptionInput.checked = true;

    const checkForUpdatesInput = document.getElementById('checkForUpdates');
    if (checkForUpdatesInput) checkForUpdatesInput.checked = checkForUpdates;

    const filteringModeInput = document.getElementById('filteringMode');
    if (filteringModeInput) filteringModeInput.checked = filteringEnabled;

    const collapseStyleInput = document.querySelector(`input[name="collapseStyle"][value="${collapseStyle}"]`);
    if (collapseStyleInput) collapseStyleInput.checked = true;

    const filterRedditInput = document.getElementById('filterRedditCommentThreads');
    if (filterRedditInput) filterRedditInput.checked = filterRedditCommentThreads;

    const filterFacebookInput = document.getElementById('filterFacebookCommentThreads');
    if (filterFacebookInput) filterFacebookInput.checked = filterFacebookCommentThreads;

    const showBlurMessageInput = document.getElementById('showBlurMessage');
    if (showBlurMessageInput) showBlurMessageInput.checked = showBlurMessage;

    // Update image filtering form elements
    const imageFilteringInput = document.getElementById('imageFilteringEnabled');
    if (imageFilteringInput) imageFilteringInput.checked = imageFilteringEnabled;

    const altTextInput = document.getElementById('checkAltText');
    if (altTextInput) altTextInput.checked = imageContext.altText;

    const captionsInput = document.getElementById('checkCaptions');
    if (captionsInput) captionsInput.checked = imageContext.captions;

    const nearbyTextInput = document.getElementById('checkNearbyText');
    if (nearbyTextInput) nearbyTextInput.checked = imageContext.nearbyText;

    const srcUrlInput = document.getElementById('checkSrcUrl');
    if (srcUrlInput) srcUrlInput.checked = imageContext.srcUrl;

    const imageContainerInput = document.querySelector(`input[name="imageContainerStyle"][value="${imageContainerStyle}"]`);
    if (imageContainerInput) imageContainerInput.checked = true;

    // Recompile regex after settings are initialized
    initializeRegex();
    console.log('Initialization complete');
  } catch (error) {
    console.error('Error initializing settings:', error);
  }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('DOM loaded, setting up...');
    // Set up event handlers first
    setupTabs();
    setupFilter();
    setupEventListeners();

    // Then initialize settings
    await initializeSettings();

    // Show the first tab by default
    const firstTab = document.querySelector('.tab-button');
    if (firstTab) {
      console.log('Clicking first tab');
      firstTab.click();
    }
    console.log('Setup complete');
  } catch (error) {
    console.error('Error during initialization:', error);
  }
});
