// Updated handleCNN.js

import { elementContainsBlockedContent } from '../contentFilter.js';

function handleCNN(nodesToHide) {
  try {
    const cnnSelectors = getCnnSelectors();

    cnnSelectors.forEach(selector => {
      try {
        const adjustedSelector = `${selector}:not(footer *)`;
        document.querySelectorAll(adjustedSelector).forEach(element => {
          try {
            if (elementContainsBlockedContent(element) || window.getComputedStyle(element).display === 'none') {
              const container = element.closest('div.container__item, article') || element;
              nodesToHide.add(container);
            }
          } catch (elementError) {
            console.debug('Error processing CNN element:', elementError);
          }
        });
      } catch (selectorError) {
        console.debug('Error with CNN selector:', selector, selectorError);
      }
    });
  } catch (error) {
    console.debug('Error in handleCNN:', error);
  }
}

function getCnnSelectors() {
  return [
    '.container__headline-text',
    '.cd__headline-text',
    '.headline__text',
    '.media__video--thumbnail',
    'article.container__content',
    'div.container__item--type-section.container__item--type-media-image',
    'a.container__link--type-video',
    '.container_grid-3__item-media',
    '.container__item-media',
    '.container__headline',
    '.container__title',
    '.cd__content',
    '.zn-body__paragraph',
    '.headline',
    '[data-test="headline"]',
    'section[data-section-name="More top stories"]',
    '.more-top-stories',
    '.story__item',
    '.story__title',
    '.story__summary',
    // Additional selectors for hidden elements
    '.container__item[style*="display: none"]',
    '.container__field-wrapper[style*="display: none"]',
    // New selector for .container
    '.container'
  ];
}

export { handleCNN };
