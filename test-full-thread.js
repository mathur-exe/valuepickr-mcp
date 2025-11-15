// Test if the MCP server correctly extracts ALL posts including pagination
const axios = require("axios");

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
    try {
        const response = await axios.get(jsonUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "application/json"
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching page ${page}: ${error.message}`);
        return null;
    }
}

async function testFullExtraction() {
    const url = "https://forum.valuepickr.com/t/a-brief-summary-of-the-micro-small-midcap-carnage/17860";

    console.log("Testing full thread extraction...\n");

    // 1. Fetch initial data
    const initialData = await fetchTopic(url);
    const { title, post_stream } = initialData;
    const totalPosts = initialData.posts_count;
    let allPosts = [...post_stream.posts];

    console.log(`Thread: ${title}`);
    console.log(`Total posts reported: ${totalPosts}`);
    console.log(`Posts in first chunk: ${allPosts.length}\n`);

    // 2. Fetch remaining pages
    const postsPerPage = 20;
    const totalPages = Math.ceil(totalPosts / postsPerPage);

    if (totalPages > 1) {
        console.log(`Need to fetch ${totalPages - 1} more page(s)...\n`);
        for (let i = 2; i <= totalPages; i++) {
            const pageData = await fetchPage(url, i);
            if (pageData && pageData.post_stream && pageData.post_stream.posts) {
                const newPosts = pageData.post_stream.posts.filter(
                    (p) => !allPosts.find((existing) => existing.id === p.id)
                );
                console.log(`  Page ${i}: fetched ${newPosts.length} new posts`);
                allPosts = [...allPosts, ...newPosts];
            }
        }
    }

    // 3. Sort and display results
    allPosts.sort((a, b) => a.post_number - b.post_number);

    console.log(`\nTotal posts collected: ${allPosts.length}`);
    console.log(`Expected: ${totalPosts}`);
    console.log(`Match: ${allPosts.length === totalPosts ? "YES" : "NO"}\n`);

    // Show first and last posts to verify
    console.log("First post:");
    console.log(`  [${allPosts[0].post_number}] ${allPosts[0].username}`);
    console.log(`  ${stripHtml(allPosts[0].cooked).substring(0, 100)}...\n`);

    console.log("Last post:");
    const last = allPosts[allPosts.length - 1];
    console.log(`  [${last.post_number}] ${last.username}`);
    console.log(`  ${stripHtml(last.cooked).substring(0, 100)}...\n`);

    // List all post numbers to verify no gaps
    const postNumbers = allPosts.map(p => p.post_number);
    console.log("Post numbers:", postNumbers.join(", "));
}

testFullExtraction().catch(console.error);

