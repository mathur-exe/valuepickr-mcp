const { sleep, stripHtml, toPositiveInt, formatDate } = require("../utils");

class ThreadService {
    constructor({ forumClient, config, logger = console }) {
        this.forumClient = forumClient;
        this.config = config;
        this.logger = logger;
    }

    getPageWindow(totalPages, { start_page, max_pages, full_thread = false }) {
        if (!totalPages || totalPages < 1) {
            return { startPage: 1, endPage: 1 };
        }

        if (full_thread) {
            return { startPage: 1, endPage: totalPages };
        }

        const startPage = Math.min(Math.max(toPositiveInt(start_page, 1), 1), totalPages);
        const maxPages = Math.min(
            toPositiveInt(max_pages, this.config.pagination.defaultMaxPages),
            this.config.pagination.hardMaxPages
        );
        const endPage = Math.min(totalPages, startPage + maxPages - 1);

        return { startPage, endPage };
    }

    getOptimalDelay(totalPages) {
        const {
            pageDelaySmallMs,
            pageDelayMediumMs,
            pageDelayLargeMs,
            pageDelayMediumMinPages,
            pageDelayLargeMinPages,
        } = this.config.rate;

        if (totalPages >= pageDelayLargeMinPages) {
            return pageDelayLargeMs;
        }

        if (totalPages >= pageDelayMediumMinPages) {
            return pageDelayMediumMs;
        }

        return pageDelaySmallMs;
    }

    async fetchPostsForPageRange(url, initialData, startPage, endPage, totalPages, { signal, onProgress } = {}) {
        let allPosts = [];
        const seenPostIds = new Set();
        const addPosts = (posts) => {
            posts.forEach((post) => {
                if (!seenPostIds.has(post.id)) {
                    seenPostIds.add(post.id);
                    allPosts.push(post);
                }
            });
        };

        if (startPage === 1) {
            addPosts((initialData.post_stream && initialData.post_stream.posts) || []);
            onProgress?.({ currentPage: 1, totalPages, processedPages: 1, windowStartPage: startPage, windowEndPage: endPage });
        } else {
            const pageData = await this.forumClient.fetchPage(url, startPage, { signal });
            addPosts((pageData?.post_stream?.posts) || []);
            onProgress?.({ currentPage: startPage, totalPages, processedPages: 1, windowStartPage: startPage, windowEndPage: endPage });
        }

        if (endPage > startPage) {
            const delayMs = this.getOptimalDelay(totalPages);
            this.logger.error?.(`Using ${delayMs}ms delay for pages ${startPage + 1}-${endPage}`);

            for (let page = startPage + 1; page <= endPage; page += 1) {
                if (signal?.aborted) {
                    throw new Error("Request cancelled");
                }

                if (delayMs > 0) {
                    await sleep(delayMs);
                }

                const pageData = await this.forumClient.fetchPage(url, page, { signal });
                addPosts((pageData?.post_stream?.posts) || []);

                onProgress?.({
                    currentPage: page,
                    totalPages,
                    processedPages: page - startPage + 1,
                    windowStartPage: startPage,
                    windowEndPage: endPage,
                });
            }
        }

        allPosts.sort((a, b) => a.post_number - b.post_number);
        return allPosts;
    }

    truncateOutput(text) {
        if (text.length <= this.config.maxOutputChars) {
            return { text, truncated: false };
        }

        return {
            text: `${text.slice(0, this.config.maxOutputChars)}\n\n[Output truncated at ${this.config.maxOutputChars} characters. Narrow the range with start_page/max_pages, or run additional chunk calls.]`,
            truncated: true,
        };
    }

    async readForumThread(params, options = {}) {
        const {
            url,
            start_page,
            max_pages,
            full_thread = false,
            include_full_content = true,
        } = params;

        const initialData = await this.forumClient.fetchTopic(url, { signal: options.signal });
        if (!initialData?.post_stream) {
            throw new Error("Invalid Discourse topic URL or no data returned.");
        }

        const totalPosts = initialData.posts_count || initialData.post_stream.stream?.length || 0;
        const postsPerPage = 20;
        const totalPages = Math.max(1, Math.ceil(totalPosts / postsPerPage));
        const { startPage, endPage } = this.getPageWindow(totalPages, {
            start_page,
            max_pages,
            full_thread,
        });

        const posts = await this.fetchPostsForPageRange(
            url,
            initialData,
            startPage,
            endPage,
            totalPages,
            options
        );

        const hasMore = endPage < totalPages;
        const nextPage = hasMore ? endPage + 1 : null;

        const views = initialData.views || "Unknown";
        const replyCount = initialData.reply_count || (totalPosts - 1);
        const likeCount = initialData.like_count || 0;
        const category = initialData.category_id || "Unknown";

        let transcript = `# Thread: ${initialData.title}\n`;
        transcript += `**Metadata**: ${views} views | ${replyCount} replies | ${likeCount} likes | Category ID: ${category}\n`;
        transcript += `**URL**: ${url}\n\n---\n\n`;
        transcript += `**Pagination**: pages ${startPage}-${endPage} of ${totalPages} | has_more=${hasMore}${nextPage ? ` | next_page=${nextPage}` : ""}\n`;
        transcript += `**Mode**: ${full_thread ? "full_thread" : "chunked"}\n\n---\n\n`;

        posts.forEach((post) => {
            if (post.deleted_at) return;

            const content = stripHtml(post.cooked).trim();
            const renderedContent = include_full_content
                ? content
                : `${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`;

            transcript += `### [${post.post_number}] ${post.username} (${formatDate(post.created_at)}):\n${renderedContent}\n\n---\n\n`;
        });

        const { text, truncated } = this.truncateOutput(transcript);
        return {
            text,
            meta: {
                tool: "read_forum_thread",
                has_more: hasMore,
                next_page: nextPage,
                start_page: startPage,
                end_page: endPage,
                total_pages: totalPages,
                truncated,
            },
        };
    }

    async searchWithinThread(params, options = {}) {
        const {
            url,
            keyword,
            case_sensitive = false,
            start_page,
            max_pages,
            full_thread = false,
            include_full_content = true,
        } = params;

        const initialData = await this.forumClient.fetchTopic(url, { signal: options.signal });
        if (!initialData?.post_stream) {
            throw new Error("Invalid Discourse topic URL or no data returned.");
        }

        const totalPosts = initialData.posts_count || initialData.post_stream.stream?.length || 0;
        const postsPerPage = 20;
        const totalPages = Math.max(1, Math.ceil(totalPosts / postsPerPage));
        const { startPage, endPage } = this.getPageWindow(totalPages, {
            start_page,
            max_pages,
            full_thread,
        });

        const posts = await this.fetchPostsForPageRange(
            url,
            initialData,
            startPage,
            endPage,
            totalPages,
            options
        );

        const searchTerm = case_sensitive ? keyword : keyword.toLowerCase();
        const matchingPosts = posts.filter((post) => {
            if (post.deleted_at) return false;
            const content = stripHtml(post.cooked);
            const searchContent = case_sensitive ? content : content.toLowerCase();
            return searchContent.includes(searchTerm);
        });

        const hasMore = endPage < totalPages;
        const nextPage = hasMore ? endPage + 1 : null;

        if (matchingPosts.length === 0) {
            return {
                text: `No posts found containing "${keyword}" in thread: ${initialData.title}`,
                meta: {
                    tool: "search_within_thread",
                    has_more: hasMore,
                    next_page: nextPage,
                    start_page: startPage,
                    end_page: endPage,
                    total_pages: totalPages,
                    truncated: false,
                },
            };
        }

        let output = `# Search Results for "${keyword}" in "${initialData.title}"\n\n`;
        output += `**Found ${matchingPosts.length} matching post(s) in scanned pages ${startPage}-${endPage} of ${totalPages}**\n`;
        output += `**Pagination**: has_more=${hasMore}${nextPage ? ` | next_page=${nextPage}` : ""}\n\n`;
        output += `**Thread URL**: ${url}\n\n---\n\n`;

        matchingPosts.forEach((post) => {
            const content = stripHtml(post.cooked).trim();
            const renderedContent = include_full_content
                ? content
                : `${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`;

            const searchContent = case_sensitive ? content : content.toLowerCase();
            const keywordIndex = searchContent.indexOf(searchTerm);
            const snippetStart = Math.max(0, keywordIndex - 100);
            const snippetEnd = Math.min(content.length, keywordIndex + searchTerm.length + 100);
            const snippet = content.substring(snippetStart, snippetEnd);
            const prefix = snippetStart > 0 ? "..." : "";
            const suffix = snippetEnd < content.length ? "..." : "";

            output += `### [Post #${post.post_number}] ${post.username} (${formatDate(post.created_at)})\n`;
            output += `**Context**: ${prefix}${snippet}${suffix}\n\n`;
            output += `**Content**:\n${renderedContent}\n\n---\n\n`;
        });

        const { text, truncated } = this.truncateOutput(output);
        return {
            text,
            meta: {
                tool: "search_within_thread",
                has_more: hasMore,
                next_page: nextPage,
                start_page: startPage,
                end_page: endPage,
                total_pages: totalPages,
                truncated,
            },
        };
    }
}

module.exports = {
    ThreadService,
};
