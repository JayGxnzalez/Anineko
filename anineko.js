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
        console.log('[AniNeko v1.0.1] fetchEp: ' + url);

        var res = await soraFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://anineko.to/'
            }
        });
        var html = await getText(res);

        // Scan all lang panels (sub, dub, hsub) for vivibebe servers
        // Returns first vivibebe entry per panel type
        var serversByType = {};
        var panelRe = /data-id="(sub|dub|hsub)">([\s\S]*?)(?=<div[^>]*data-id="|<\/div>\s*<\/div>\s*<\/div>|$)/g;
        var pm;
        while ((pm = panelRe.exec(html)) !== null) {
            var panelType = pm[1];
            var panelContent = pm[2];
            if (serversByType[panelType]) continue; // already got one
            var vv = panelContent.match(/data-video="(https:\/\/vivibebe\.site\/([^?"]+)(?:\?sub=([^"]+))?)"/);
            if (vv) {
                serversByType[panelType] = {
                    videoId: vv[2],
                    subVtt: vv[3] ? decodeURIComponent(vv[3]) : ''
                };
            }
        }

        console.log('[AniNeko v1.0.1] panels found: ' + Object.keys(serversByType).join(','));

        var streams = [];
        var subtitles = '';
        var allSubtitles = [];

        // Prefer sub, then dub — add both if available
        var order = ['sub', 'dub', 'hsub'];
        for (var i = 0; i < order.length; i++) {
            var type = order[i];
            var info = serversByType[type];
            if (!info) continue;
            var label = type === 'sub' ? 'SUB - HD1' : (type === 'dub' ? 'DUB - HD1' : 'HSUB - HD1');
            streams.push({
                title: label,
                streamUrl: 'https://vivibebe.site/public/stream/' + info.videoId + '/master.m3u8',
                headers: { 'Referer': 'https://vivibebe.site/', 'Origin': 'https://vivibebe.site' }
            });
            if (info.subVtt && !subtitles) {
                subtitles = info.subVtt;
                allSubtitles.push({ file: info.subVtt, label: 'English', kind: 'captions' });
            }
        }

        if (streams.length === 0) {
            console.log('[AniNeko v1.0.1] No vivibebe streams found for: ' + url);
        }

        return JSON.stringify({
            streams: streams,
            subtitles: subtitles,
            subtitlesHeaders: {},
            allSubtitles: allSubtitles
        });

    } catch(e) {
        console.log('[AniNeko v1.0.1] extractStreamUrl error: ' + e.message);
        return JSON.stringify({ streams: [], subtitles: '', subtitlesHeaders: {}, allSubtitles: [] });
    }
}
