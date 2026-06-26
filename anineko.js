// AniNeko SUB + DUB Module
// Scrapes anineko.to — parses embed URLs directly from page HTML
// Providers: vivibebe.site (HD-1), bibiemb.xyz (HD-2)

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
// EMBED PAGE M3U8 EXTRACTOR
// Fetches embed page and pulls master.m3u8 from const src = "..."
// Works for both vivibebe.site and bibiemb.xyz
// ==========================================

async function getEmbedStream(embedUrl, fallbackId) {
    try {
        var res = await soraFetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://anineko.to/'
            }
        });
        var html = await getText(res);

        // Try const/var/let assignment with master.m3u8
        var srcMatch = html.match(/(?:const|var|let)\s+\w+\s*=\s*["']([^"']+master\.m3u8[^"']*)["']/);
        if (!srcMatch) {
            // Fallback: any quoted master.m3u8 URL in the page
            srcMatch = html.match(/["'](https?:\/\/[^"']+master\.m3u8)["']/);
        }
        if (srcMatch) {
            console.log('[AniNeko v1.0.3] embed src: ' + srcMatch[1]);
            return srcMatch[1];
        }

        var fallback = 'https://vivibebe.site/public/stream/' + fallbackId + '/master.m3u8';
        console.log('[AniNeko v1.0.3] fallback: ' + fallback);
        return fallback;
    } catch(e) {
        console.log('[AniNeko v1.0.3] getEmbedStream err (' + embedUrl + '): ' + e.message);
        return 'https://vivibebe.site/public/stream/' + fallbackId + '/master.m3u8';
    }
}

// ==========================================
// SUBTITLE NORMALIZER
// bibiemb ?sub_e= gives a relative path, vivibebe ?sub= gives full URL
// ==========================================

function normalizeVtt(raw) {
    if (!raw) return '';
    var decoded = decodeURIComponent(raw);
    // Already a full URL
    if (decoded.indexOf('http') === 0) return decoded;
    // Relative path — prepend anizara CDN
    return 'https://cdn.anizara.store/' + decoded;
}

// ==========================================
// MODULE FUNCTIONS
// ==========================================

async function searchResults(keyword) {
    try {
        var url = 'https://anineko.to/browser?keyword=' + encodeURIComponent(keyword);
        var res = await soraFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        var html = await getText(res);

        var results = [];
        var cardRe = /<article class="nv-anime-card[^"]*">[\s\S]*?href="\/watch\/([^"]+)"[\s\S]*?<img src="([^"]+)"[\s\S]*?<h3 class="nv-anime-title"><a[^>]*>([^<]+)<\/a>/g;
        var m;
        while ((m = cardRe.exec(html)) !== null) {
            results.push({ title: m[3], image: m[2], href: 'https://anineko.to/watch/' + m[1] });
        }

        return JSON.stringify(results);
    } catch(e) {
        console.log('[AniNeko] searchResults error: ' + e.message);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        var res = await soraFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        var html = await getText(res);

        var descMatch = html.match(/<p class="nv-desc">([^<]+)<\/p>/);
        var desc = descMatch
            ? descMatch[1]
                .replace(/&#039;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
            : 'No description available.';

        return JSON.stringify([{ description: desc, aliases: '', airdate: '' }]);
    } catch(e) {
        console.log('[AniNeko] extractDetails error: ' + e.message);
        return JSON.stringify([{ description: 'No description available.', aliases: '', airdate: '' }]);
    }
}

async function extractEpisodes(url) {
    try {
        var res = await soraFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
                episodes.push({ href: 'https://anineko.to/watch/' + slug + '/' + m[1], number: n });
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
        console.log('[AniNeko v1.0.3] fetchEp: ' + url);

        var res = await soraFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://anineko.to/' }
        });
        var html = await getText(res);

        // Parse HD-1 (vivibebe) and HD-2 (bibiemb) per lang panel
        var serversByType = {};
        var panelRe = /data-id="(sub|dub|hsub)">([\s\S]*?)(?=<div[^>]*data-id="|<\/div>\s*<\/div>\s*<\/div>|$)/g;
        var pm;
        while ((pm = panelRe.exec(html)) !== null) {
            var panelType = pm[1];
            var panelContent = pm[2];
            if (serversByType[panelType]) continue;

            // vivibebe HD-1: ?sub= gives full VTT URL
            var vv = panelContent.match(/data-video="(https:\/\/vivibebe\.site\/([^?"]+)(?:\?sub=([^"]+))?)"/);
            // bibiemb HD-2: ?sub_e= gives relative VTT path or no param for hsub
            var bb = panelContent.match(/data-video="(https:\/\/bibiemb\.xyz\/([^?"]+)(?:\?sub(?:_e)?=([^"&]+))?[^"]*)"/);

            serversByType[panelType] = {
                hd1: vv ? {
                    embedUrl: vv[1].split('?')[0],
                    videoId: vv[2],
                    subVtt: normalizeVtt(vv[3] || '')
                } : null,
                hd2: bb ? {
                    embedUrl: bb[1].split('?')[0],
                    videoId: bb[2],
                    subVtt: normalizeVtt(bb[3] || '')
                } : null
            };
        }

        console.log('[AniNeko v1.0.3] panels: ' + Object.keys(serversByType).join(','));

        // Build parallel fetch tasks: SUB HD-1, SUB HD-2, DUB HD-1, DUB HD-2, HSUB HD-1, HSUB HD-2
        var tasks = [];
        var order = ['sub', 'dub', 'hsub'];
        for (var i = 0; i < order.length; i++) {
            var type = order[i];
            var panel = serversByType[type];
            if (!panel) continue;
            if (panel.hd1) tasks.push({ type: type, server: 'HD-1', info: panel.hd1 });
            if (panel.hd2) tasks.push({ type: type, server: 'HD-2', info: panel.hd2 });
        }

        var m3u8Results = await Promise.all(tasks.map(function(t) {
            return getEmbedStream(t.info.embedUrl, t.info.videoId);
        }));

        var streams = [];
        var subtitles = '';
        var allSubtitles = [];

        for (var j = 0; j < tasks.length; j++) {
            var task = tasks[j];
            var m3u8Url = m3u8Results[j];
            var typeLabel = task.type === 'sub' ? 'SUB' : (task.type === 'dub' ? 'DUB' : 'HSUB');

            streams.push({
                title: typeLabel + ' - ' + task.server,
                streamUrl: m3u8Url,
                headers: { 'Referer': 'https://anineko.to/', 'Origin': 'https://anineko.to' }
            });

            if (task.info.subVtt && !subtitles) {
                subtitles = task.info.subVtt;
                allSubtitles.push({ file: task.info.subVtt, label: 'English', kind: 'captions' });
            }
        }

        if (streams.length === 0) {
            console.log('[AniNeko v1.0.3] No streams found for: ' + url);
        }

        return JSON.stringify({
            streams: streams,
            subtitles: subtitles,
            subtitlesHeaders: {},
            allSubtitles: allSubtitles
        });

    } catch(e) {
        console.log('[AniNeko v1.0.3] extractStreamUrl error: ' + e.message);
        return JSON.stringify({ streams: [], subtitles: '', subtitlesHeaders: {}, allSubtitles: [] });
    }
}
