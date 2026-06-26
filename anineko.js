// AniNeko SUB + DUB Module
// Scrapes anineko.to — parses embed URLs directly from page HTML
// Stream provider: vivibebe.site (master.m3u8)

// ==========================================
// SORA FETCH WRAPPER
// ==========================================

async function soraFetch(url, options) {
    options = options || { headers: {}, method: 'GET', body: null };
    try {
        if (typeof fetchv2 !== 'undefined') {
            return await fetchv2(url, options.headers || {}, options.method || 'GET', options.body || null, true, options.encoding || 'utf-8');
        } else {
            return await fetch(url, options);
        }
    } catch(e) {
        try { return await fetch(url, options); } catch(err) { return null; }
    }
}

async function getText(res) {
    if (!res) return '';
    try {
        return typeof res.text === 'function' ? await res.text() : (res.body || '');
    } catch(e) { return ''; }
}

// ==========================================
// MODULE FUNCTIONS
// ==========================================

async function searchResults(keyword) {
    try {
        var url = 'https://anineko.to/browser?keyword=' + encodeURIComponent(keyword);
        var res = await soraFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        var html = await getText(res);

        var results = [];
        var cardRe = /<article class="nv-anime-card[^"]*">[\s\S]*?href="\/watch\/([^"]+)"[\s\S]*?<img src="([^"]+)"[\s\S]*?<h3 class="nv-anime-title"><a[^>]*>([^<]+)<\/a>/g;
        var m;
        while ((m = cardRe.exec(html)) !== null) {
            results.push({
                title: m[3],
                image: m[2],
                href: 'https://anineko.to/watch/' + m[1]
            });
        }

        return JSON.stringify(results);
    } catch(e) {
        console.log('[AniNeko] searchResults error: ' + e.message);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        var res = await soraFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        var html = await getText(res);

        var descMatch = html.match(/<p class="nv-desc">([^<]+)<\/p>/);
        var desc = descMatch
            ? descMatch[1]
                .replace(/&#039;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
            : 'No description available.';

        return JSON.stringify([{
            description: desc,
            aliases: '',
            airdate: ''
        }]);
    } catch(e) {
        console.log('[AniNeko] extractDetails error: ' + e.message);
        return JSON.stringify([{ description: 'No description available.', aliases: '', airdate: '' }]);
    }
}

async function extractEpisodes(url) {
    try {
        var res = await soraFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        var html = await getText(res);

        var slugMatch = url.match(/\/watch\/([^/]+)/);
        var slug = slugMatch ? slugMatch[1] : '';

        var episodes = [];
        var epRe = /href="\/watch\/[^/]+\/(ep-(\d+))"/g;
        var seen = {};
        var m;
        while ((m = epRe.exec(html)) !== null) {
            var n = parseInt(m[2]);
            if (!seen[n]) {
                seen[n] = true;
                episodes.push({
                    href: 'https://anineko.to/watch/' + slug + '/' + m[1],
                    number: n
                });
            }
        }
        episodes.sort(function(a, b) { return a.number - b.number; });

        return JSON.stringify(episodes);
    } catch(e) {
        console.log('[AniNeko] extractEpisodes error: ' + e.message);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        console.log('[AniNeko v1.0.0] fetchEp: ' + url);

        var res = await soraFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://anineko.to/'
            }
        });
        var html = await getText(res);

        // Parse first vivibebe data-video URL from a lang panel section
        // Returns { videoId, subVtt }
        function parseVivibebeFromPanel(panelHtml) {
            var m = panelHtml.match(/data-video="(https:\/\/vivibebe\.site\/([^?"]+)(?:\?sub=([^"]+))?)"/);
            if (!m) return null;
            return {
                videoId: m[2],
                subVtt: m[3] ? decodeURIComponent(m[3]) : ''
            };
        }

        var subPanel = html.match(/data-id="sub">([\s\S]*?)(?=<div[^>]*lang-group[^>]*data-id="dub"|$)/);
        var dubPanel = html.match(/data-id="dub">([\s\S]*?)(?=<\/div>\s*<\/div>|$)/);

        var subInfo = subPanel ? parseVivibebeFromPanel(subPanel[1]) : null;
        var dubInfo = dubPanel ? parseVivibebeFromPanel(dubPanel[1]) : null;

        var streams = [];
        var subtitles = '';
        var subtitlesHeaders = {};
        var allSubtitles = [];

        if (subInfo && subInfo.videoId) {
            streams.push({
                title: 'SUB - HD1',
                streamUrl: 'https://vivibebe.site/public/stream/' + subInfo.videoId + '/master.m3u8',
                headers: { 'Referer': 'https://vivibebe.site/', 'Origin': 'https://vivibebe.site' }
            });
            if (subInfo.subVtt && !subtitles) {
                subtitles = subInfo.subVtt;
                allSubtitles.push({ file: subInfo.subVtt, label: 'English', kind: 'captions' });
            }
        }

        if (dubInfo && dubInfo.videoId) {
            streams.push({
                title: 'DUB - HD1',
                streamUrl: 'https://vivibebe.site/public/stream/' + dubInfo.videoId + '/master.m3u8',
                headers: { 'Referer': 'https://vivibebe.site/', 'Origin': 'https://vivibebe.site' }
            });
            if (dubInfo.subVtt && !subtitles) {
                subtitles = dubInfo.subVtt;
                allSubtitles.push({ file: dubInfo.subVtt, label: 'English', kind: 'captions' });
            }
        }

        if (streams.length === 0) {
            console.log('[AniNeko v1.0.0] No streams found for: ' + url);
        }

        return JSON.stringify({
            streams: streams,
            subtitles: subtitles,
            subtitlesHeaders: subtitlesHeaders,
            allSubtitles: allSubtitles
        });

    } catch(e) {
        console.log('[AniNeko v1.0.0] extractStreamUrl error: ' + e.message);
        return JSON.stringify({ streams: [], subtitles: '', subtitlesHeaders: {}, allSubtitles: [] });
    }
}
