// Import necessary modules
import { DEFAULT_IGNORED_URLS, DEFAULT_KEYWORD_GROUPS } from '../scripts/keywords.js';
import { DEFAULT_ELEMENT_GROUPS } from '../scripts/elements.js';
import { exportSettings, importSettings } from '../scripts/settingsManager.js';

// Initialize the settings
async function initializeSettings() {
  const result = await chrome.storage.local.get([
    'ignoredDomains',
    'keywordGroups',
    'customKeywords',
    'disabledGroups',
    'disabledKeywords',
    'disabledDomains',
    'disabledDomainGroups',
    'elementGroups',
    'disabledElementGroups',
    'disabledElements',
    'matchingOption',
    'importUrl',
    'checkForUpdates'
  ]);

  // Initialize domains
  let ignoredDomains = result.ignoredDomains;
  if (!ignoredDomains) {
    ignoredDomains = DEFAULT_IGNORED_URLS;
    await chrome.storage.local.set({ ignoredDomains });
  }

  // Initialize keyword groups
  let keywordGroups = result.keywordGroups;
  if (!keywordGroups) {
    keywordGroups = DEFAULT_KEYWORD_GROUPS;
    await chrome.storage.local.set({ keywordGroups });
  }

  // Initialize element groups
  let elementGroups = result.elementGroups;
  if (!elementGroups) {
    elementGroups = DEFAULT_ELEMENT_GROUPS;
    await chrome.storage.local.set({ elementGroups });
  }

  // Initialize other settings
  let customKeywords = result.customKeywords || [];
  let disabledGroups = result.disabledGroups || [];
  let disabledKeywords = result.disabledKeywords || [];
  let disabledDomains = result.disabledDomains || [];
  let disabledDomainGroups = result.disabledDomainGroups || [];
  let disabledElementGroups = result.disabledElementGroups || [];
  let disabledElements = result.disabledElements || [];
  let matchingOption = result.matchingOption !== undefined ? result.matchingOption : 'flexible';
  let importUrl = result.importUrl || '';
  let checkForUpdates = result.checkForUpdates !== undefined ? result.checkForUpdates : true;

  // Sort custom keywords alphabetically
  customKeywords.sort();

  await chrome.storage.local.set({
    customKeywords,
    disabledGroups,
    disabledKeywords,
    disabledDomains,
    disabledDomainGroups,
    disabledElementGroups,
    disabledElements,
    matchingOption,
    importUrl,
    checkForUpdates
  });

  // Update UI elements
  updateDomainGroups(ignoredDomains, disabledDomains, disabledDomainGroups);
  updateKeywordGroups(keywordGroups, customKeywords, disabledGroups, disabledKeywords);
  updateElementGroups(elementGroups, disabledElementGroups, disabledElements);
  document.querySelector(`input[name = "matchingOptions"][value = "${matchingOption}"]`).checked = true;
  document.getElementById('urlInput').value = importUrl;
  document.getElementById('checkForUpdates').checked = checkForUpdates;
}

function setupFilter() {
  // Get filter inputs
  const keywordFilter = document.getElementById('filterInput');
  const domainFilter = document.getElementById('domainFilterInput');
  const elementFilter = document.getElementById('elementFilterInput');

  // Keyword filtering
  keywordFilter?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    // Filter keyword items
    document.querySelectorAll('#keywordGroups .keyword-item, #customKeywords .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });

    // Hide empty groups
    document.querySelectorAll('#keywordGroups .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
  });

  // Domain filtering
  domainFilter?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    // Filter domain items
    document.querySelectorAll('#domainList .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });

    // Hide empty groups
    document.querySelectorAll('#domainList .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
  });

  // Element filtering
  elementFilter?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    // Filter element items
    document.querySelectorAll('#elementGroups .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });

    // Hide empty groups
    document.querySelectorAll('#elementGroups .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
  });
}