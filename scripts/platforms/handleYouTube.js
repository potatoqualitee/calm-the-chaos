// handleYouTube.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class YouTubeHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            videos: 'ytd-rich-grid-media:not(footer *), ytd-video-renderer:not(footer *), ytd-compact-video-renderer:not(footer *)',
            comments: 'ytd-comment-thread-renderer:not(footer *)'
        };
    }

    handlePreconfigured() {
        // Handle YouTube videos
        this.processSelectors([this.selectors.videos], (video) => {
            this.checkAndHideElement(video);
        }, 'YouTube video');

        // Handle YouTube comments
        this.processSelectors([this.selectors.comments], (comment) => {
            this.checkAndHideElement(comment);
        }, 'YouTube comment');
    }
}

const handler = new YouTubeHandler();
export const handleYouTube = (nodesToHide) => handler.handle(nodesToHide);
