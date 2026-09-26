const { formatDate } = require("../utils");

class SearchService {
    constructor({ forumClient }) {
        this.forumClient = forumClient;
    }

    async searchForum({ query, limit = 10 }, { signal } = {}) {
        const results = await this.forumClient.searchForum(query, limit, { signal });

        if (results.length === 0) {
            return {
                text: `No results found for query: "${query}"`,
                meta: {
                    tool: "search_forum",
                    count: 0,
                },
            };
        }

        let output = `# Search Results for "${query}"\n\n`;

        results.forEach((topic, index) => {
            const url = `https://forum.valuepickr.com/t/${topic.slug}/${topic.id}`;
            output += `### ${index + 1}. ${topic.title}\n`;
            output += `- **URL**: ${url}\n`;
            output += `- **Date**: ${formatDate(topic.created_at)} | **Replies**: ${Math.max(0, (topic.posts_count || 1) - 1)} | **Views**: ${topic.views ?? "Unknown"}\n\n`;
        });

        return {
            text: output,
            meta: {
                tool: "search_forum",
                count: results.length,
            },
        };
    }
}

module.exports = {
    SearchService,
};
