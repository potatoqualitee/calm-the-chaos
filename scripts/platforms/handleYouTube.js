// handleYouTube.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class YouTubeHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            videos: [
                'ytd-rich-grid-media',
                'ytd-video-renderer',
                'ytd-compact-video-renderer',
                'ytd-grid-video-renderer',
                'ytd-reel-item-renderer',
                'yt-lockup-view-model'
            ].map(selector => `${selector}:not(footer *)`).join(', '),
            comments: 'ytd-comment-thread-renderer:not(footer *)'
        };
    }

    async handlePreconfigured(roots = null) {
        // Handle YouTube videos
        await this.processSelectors([this.selectors.videos], video =>
            this.checkAndHideElement(video), 'YouTube video', roots);

        // Handle YouTube comments
        await this.processSelectors([this.selectors.comments], comment =>
            this.checkAndHideElement(comment), 'YouTube comment', roots);
    }
}

const handler = new YouTubeHandler();
export const handleYouTube = (nodesToHide, roots = null) => handler.handle(nodesToHide, roots);
