// Test the new search_within_thread functionality
const axios = require("axios");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, "");
}

async function fetchTopic(url) {
    const jsonUrl = url.split("?")[0].replace(/\/$/, "") + ".json";
    const response = await axios.get(jsonUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json"
        }
    });
    return response.data;
}

async function fetchPage(url, page) {
    const jsonUrl = url.split("?")[0].replace(/\/$/, "") + ".json?page=" + page;
    const response = await axios.get(jsonUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json"
        }
    });
    return response.data;
}

async function searchWithinThread(url, keyword, caseSensitive = false) {
    console.log(`\nSearching for "${keyword}" in thread: ${url}`);
    console.log("Fetching all posts...");

    const initialData = await fetchTopic(url);
    const { title, post_stream } = initialData;
    const totalPosts = initialData.posts_count;
    let allPosts = [...post_stream.posts];

    const postsPerPage = 20;
    const totalPages = Math.ceil(totalPosts / postsPerPage);

    if (totalPages > 1) {
        console.log(`Need to fetch ${totalPages - 1} more page(s)...`);
        for (let i = 2; i <= totalPages; i++) {
            await sleep(200);
            const pageData = await fetchPage(url, i);
            if (pageData && pageData.post_stream && pageData.post_stream.posts) {
                const newPosts = pageData.post_stream.posts.filter(
                    (p) => !allPosts.find((existing) => existing.id === p.id)
                );
                allPosts = [...allPosts, ...newPosts];
            }
        }
    }

    console.log(`Fetched ${allPosts.length} posts total`);

    // Search
    allPosts.sort((a, b) => a.post_number - b.post_number);
    const searchTerm = caseSensitive ? keyword : keyword.toLowerCase();
    const matchingPosts = allPosts.filter((post) => {
        if (post.deleted_at) return false;
        const content = stripHtml(post.cooked);
        const searchContent = caseSensitive ? content : content.toLowerCase();
        return searchContent.includes(searchTerm);
    });

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Thread: ${title}`);
    console.log(`Keyword: "${keyword}"`);
    console.log(`Found ${matchingPosts.length} matching post(s) out of ${totalPosts} total`);
    console.log("=".repeat(60));

    matchingPosts.forEach((post, index) => {
        const date = new Date(post.created_at).toISOString().split('T')[0];
        const content = stripHtml(post.cooked).trim();

        // Create snippet
        const searchContent = caseSensitive ? content : content.toLowerCase();
        const keywordIndex = searchContent.indexOf(searchTerm);
        const snippetStart = Math.max(0, keywordIndex - 100);
        const snippetEnd = Math.min(content.length, keywordIndex + searchTerm.length + 100);
        const snippet = content.substring(snippetStart, snippetEnd);
        const prefix = snippetStart > 0 ? "..." : "";
        const suffix = snippetEnd < content.length ? "..." : "";

        console.log(`\n[${index + 1}] Post #${post.post_number} by ${post.username} (${date})`);
        console.log(`Context: ${prefix}${snippet}${suffix}`);
        console.log("-".repeat(60));
    });

    return matchingPosts;
}

async function runTests() {
    console.log("=".repeat(60));
    console.log("TESTING: search_within_thread");
    console.log("=".repeat(60));

    // Test 1: Search in Ranvir's portfolio for "Lenskart"
    await searchWithinThread(
        "https://forum.valuepickr.com/t/ranvirs-portfolio/1237",
        "Lenskart"
    );

    await sleep(1000);

    // Test 2: Search in a smaller thread
    await searchWithinThread(
        "https://forum.valuepickr.com/t/ranjans-portfolio/45082",
        "portfolio"
    );

    console.log("\n" + "=".repeat(60));
    console.log("ALL TESTS COMPLETED ✓");
    console.log("=".repeat(60));
}

runTests().catch(console.error);
