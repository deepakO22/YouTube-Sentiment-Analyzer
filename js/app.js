const ELEMENTS = {
    input: document.querySelector('.search-input'),
    btn: document.querySelector('.analyze-btn'),
    suggestions: document.getElementById('search-suggestions'),
    spinner: document.getElementById('spinner'),
    videoSection: document.querySelector('.video-grid'),
    chartSection: document.querySelector('.chart-container'),
    commentsSection: document.getElementById('comments-section'),
    errorMsg: document.getElementById('error-message'),
    themeCheckbox: document.getElementById('theme-toggle-checkbox'),
    videoLink: document.getElementById('video-link')
};

// Initialize Local Model
if (window.SentimentAnalyzer) {
    window.SentimentAnalyzer.init().then(() => console.log("Local TFJS Model Loaded"));
}

let currentVideoId = null;
let isPolling = false;
let pollingInterval = null;
let commentCache = new Set();
let sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
let totalProcessed = 0;
let searchTimeout = null;

// Theme Toggle
ELEMENTS.themeCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.body.setAttribute('data-theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
    }
});

// Search & Input Logic
ELEMENTS.btn.addEventListener('click', () => handleAnalysis());
ELEMENTS.input.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        ELEMENTS.suggestions.classList.add('hidden');
        handleAnalysis();
        return;
    }

    // Auto-search (Debounce)
    const query = ELEMENTS.input.value.trim();
    if (!query) {
        ELEMENTS.suggestions.classList.add('hidden');
        return;
    }

    // If it looks like a url or ID, don't search suggestions, just wait for enter
    if (extractVideoId(query)) {
        ELEMENTS.suggestions.classList.add('hidden');
        return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        fetchSuggestions(query);
    }, 500); // 500ms delay
});

// Close suggestions on click outside
document.addEventListener('click', (e) => {
    if (!ELEMENTS.suggestions.contains(e.target) && e.target !== ELEMENTS.input) {
        ELEMENTS.suggestions.classList.add('hidden');
    }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        filterComments(e.target.dataset.tab);
    });
});

async function handleAnalysis() {
    const input = ELEMENTS.input.value.trim();
    if (!input) return;

    resetUI();
    const videoId = extractVideoId(input);

    if (videoId) {
        loadVideo(videoId);
    } else {
        showError("Invalid Video Link or ID. Please select a video from the suggestions.");
    }
}

async function fetchSuggestions(query) {
    try {
        const res = await fetch(`php/youtubeSearch.php?q=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);
        if (data.videos) renderSuggestions(data.videos);

    } catch (err) {
        console.error(err);
    }
}

function renderSuggestions(videos) {
    ELEMENTS.suggestions.innerHTML = '';

    if (videos.length === 0) {
        ELEMENTS.suggestions.classList.add('hidden');
        return;
    }

    videos.forEach(v => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
            <img src="${v.thumbnail}" alt="">
            <div class="suggestion-info">
                <h4>${v.title}</h4>
                <p>${v.channelTitle}</p>
            </div>
        `;
        div.onclick = () => {
            ELEMENTS.input.value = `https://www.youtube.com/watch?v=${v.videoId}`;
            ELEMENTS.suggestions.classList.add('hidden');
            // Per user request: "url is loaded upon clicking analyse". 
            // So we just fill input. Optionally we could auto-click analyze, but being explicit is often better.
            // Actually user said "if user clicks one and the url is loaded upon clicking analyse". 
            // This is slightly ambiguous ("clicks one... loaded... upon clicking analyze").
            // I will auto-focus the analyze button to hint action.
            ELEMENTS.btn.focus();
        };
        ELEMENTS.suggestions.appendChild(div);
    });

    ELEMENTS.suggestions.classList.remove('hidden');
}

function extractVideoId(input) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = input.match(regExp);
    if (match && match[7].length == 11) {
        return match[7];
    }
    // Assume if it's 11 chars alphanumeric it's an ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        return input;
    }
    return null;
}

let pollCursor = ''; // specific cursor for live chat

// ...

async function loadVideo(videoId) {
    currentVideoId = videoId;
    pollCursor = ''; // Reset cursor

    showSpinner(true);
    hideSections();

    try {
        const res = await fetch(`php/youtubeGetComments.php?v=${videoId}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);
        if (data.commentsDisabled) {
            showError(data.message);
        }

        renderVideoDetails(data);

        // Process initial comments
        if (data.comments && data.comments.length > 0) {
            await processComments(data.comments);
        }

        // Check Live Status
        // data.isLiveChat is set by backend if we found an active chat
        if (data.isLiveChat) {
            pollCursor = data.nextPageToken || ''; // Set initial cursor
            // Start polling with dynamic interval if provided, else default 10s
            const interval = data.pollingIntervalMillis ? Math.max(data.pollingIntervalMillis, 10000) : 10000;
            startPolling(videoId, interval);
        } else if (data.liveBroadcastContent === 'live') {
            // Fallback if backend says live but no chat ID (rare/disabled chat)
            startPolling(videoId, 10000);
        }

    } catch (err) {
        showError(err.message);
    } finally {
        showSpinner(false);
    }
}

function startPolling(videoId, intervalMs) {
    if (isPolling) return;
    isPolling = true;
    console.log(`Starting Live Polling (Interval: ${intervalMs}ms)...`);

    pollingInterval = setInterval(async () => {
        if (currentVideoId !== videoId) {
            stopPolling();
            return;
        }

        try {
            // Append cursor if we have one
            let url = `php/youtubeGetComments.php?v=${videoId}`;
            if (pollCursor) {
                url += `&pageToken=${pollCursor}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            // Update cursor for NEXT poll
            if (data.nextPageToken) {
                pollCursor = data.nextPageToken;
            }

            // Process New Comments
            if (data.comments && data.comments.length > 0) {
                // If using cursor/isLiveChat, typically all returned are "new" since the token
                // But we still dedupe just in case or if falling back to standard id-check

                // If it is live chat, we blindly accept them as "new" if we trust the functionality,
                // but deduping relies on exact string match which is risky for common messages ("hi", "lol").
                // Ideally we'd use message ID, but we only have text strings here.
                // Since cache works on strings, "lol" second time will be ignored.
                // User asked for cache + cursor. 
                // We will relax cache for live chat? No, duplicate text is duplicate sentiment.
                // We'll stick to cache logic for now.

                const newComments = data.comments.filter(c => !commentCache.has(c));
                if (newComments.length > 0) {
                    await processComments(newComments);
                }
            }
        } catch (e) {
            console.error("Polling error", e);
        }
    }, intervalMs);
}

function stopPolling() {
    isPolling = false;
    if (pollingInterval) clearInterval(pollingInterval);
}

async function processComments(comments) {
    // 1. Add to cache strings
    const newComments = [];
    comments.forEach(c => {
        if (!commentCache.has(c)) {
            commentCache.add(c);
            newComments.push(c);
        }
    });

    if (newComments.length === 0) return;

    // 2. Batch for HF API (max 20 per batch to be safe)
    const batchSize = 10;

    // Create Chart Instance if not exists
    if (!window.mySentimentChart) {
        initChart();
    }

    for (let i = 0; i < newComments.length; i += batchSize) {
        const batch = newComments.slice(i, i + batchSize);
        const sentiments = await getSentiments(batch);

        // 3. Update UI
        batch.forEach((text, idx) => {
            const result = sentiments[idx];
            let label = 'neutral';

            if (result && Array.isArray(result)) {
                // Find max score
                if (result.length > 0) {
                    const top = result.reduce((prev, current) => (prev.score > current.score) ? prev : current);
                    label = top.label;
                }
            } else if (result && result.label) {
                label = result.label;
            }

            label = label.toLowerCase();

            // Handle cardiffnlp/twitter-roberta-base-sentiment-latest labels
            // This model usually returns "positive", "neutral", "negative" directly
            // But sometimes it returns "label_0", "label_1", "label_2" (0=neg, 1=neu, 2=pos)

            if (label === 'label_0') label = 'negative';
            if (label === 'label_1') label = 'neutral';
            if (label === 'label_2') label = 'positive';

            // Just in case it returns "Pos", "Neu", "Neg" or similar
            if (label.startsWith('pos')) label = 'positive';
            if (label.startsWith('neu')) label = 'neutral';
            if (label.startsWith('neg')) label = 'negative';

            // Ensure we have valid label
            if (label !== 'positive' && label !== 'negative' && label !== 'neutral') {
                label = 'neutral';
            }

            sentimentCounts[label]++;
            totalProcessed++;

            // Extract score for display
            let scoreVal = 0;
            if (result && Array.isArray(result) && result.length > 0) {
                // re-find the matching result or just use the top one we found logic for?
                // Simpler: just use the result object if we had it.
                // We need to re-capture the score logic slightly better or just pick the max again.
                const top = result.reduce((prev, current) => (prev.score > current.score) ? prev : current);
                scoreVal = top.score;
            } else if (result && result.score) {
                scoreVal = result.score;
            }

            addCommentToUI(text, label, scoreVal);
        });

        updateChart();
    }

    // Unhide sections
    ELEMENTS.videoSection.classList.remove('hidden');
    ELEMENTS.commentsSection.classList.remove('hidden');
    ELEMENTS.chartSection.classList.remove('hidden');
}

function initChart() {
    const ctx = document.getElementById('sentimentChart').getContext('2d');

    // Destroy existing chart if it exists to avoid overlaps on re-init (though we check window.mySentimentChart before calling init)
    if (window.mySentimentChart) {
        window.mySentimentChart.destroy();
    }

    window.mySentimentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    '#00c853', // Positive Green
                    '#0091ea', // Neutral Blue
                    '#d50000'  // Negative Red
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            cutout: '70%'
        }
    });
}

async function getSentiments(inputs) {
    let useLocal = false;
    let apiData = null;

    // Try API First (if not already strictly using local due to prev failure? No, retry is okay unless we wanna cache the failure state)
    // To make it robust:
    try {
        const res = await fetch('php/huggingfaceProxy.php', {
            method: 'POST',
            body: JSON.stringify({ inputs: inputs })
        });

        if (res.ok) {
            const data = await res.json();
            // Check if it's an error response pretending to be ok or just error
            if (data.error) {
                console.warn("API Error (Switching to Local):", data.error);
                useLocal = true;
            } else {
                apiData = data;
            }
        } else {
            console.warn(`API HTTP ${res.status}(Switching to Local)`);
            useLocal = true;
        }
    } catch (e) {
        console.warn("API Connection Failed (Switching to Local):", e);
        useLocal = true;
    }

    // Fallback to Local Model
    if (useLocal || !apiData) {
        if (!window.SentimentAnalyzer) {
            console.error("SentimentAnalyzer not loaded and API failed.");
            return inputs.map(() => ({ label: 'neutral', score: 0.5 })); // Last resort
        }

        await window.SentimentAnalyzer.init();

        // Return local predictions formatted like API
        return inputs.map(text => {
            const prediction = window.SentimentAnalyzer.predict(text);
            return [{ label: prediction.label, score: prediction.score }];
        });
    }

    return apiData;
}

function updateChart() {
    const total = totalProcessed || 1;
    const posPct = (sentimentCounts.positive / total) * 100;
    const neuPct = (sentimentCounts.neutral / total) * 100;
    const negPct = (sentimentCounts.negative / total) * 100;

    document.querySelector('.bar-fill.positive').style.width = `${posPct}%`;
    document.querySelector('.label-positive').innerText = `${sentimentCounts.positive} (${posPct.toFixed(1)}%)`;

    document.querySelector('.bar-fill.neutral').style.width = `${neuPct}%`;
    document.querySelector('.label-neutral').innerText = `${sentimentCounts.neutral} (${neuPct.toFixed(1)}%)`;

    document.querySelector('.bar-fill.negative').style.width = `${negPct}%`;
    document.querySelector('.label-negative').innerText = `${sentimentCounts.negative} (${negPct.toFixed(1)}%)`;

    // Added: Update Chart.js Instance
    if (window.mySentimentChart) {
        window.mySentimentChart.data.datasets[0].data = [
            sentimentCounts.positive,
            sentimentCounts.neutral,
            sentimentCounts.negative
        ];
        window.mySentimentChart.update();
    }
}

function addCommentToUI(text, sentiment, rawScore) {
    const tbody = document.getElementById(`tbody-${sentiment}`);
    if (!tbody) return;

    const tr = document.createElement('tr');

    // Calculate Polarity (-1 to 1)
    const polarity = (rawScore * 2) - 1;
    const polarityStr = polarity.toFixed(2);

    // Determine color for polarity text
    let colorVar = 'var(--text-color)';
    if (polarity > 0.25) colorVar = 'var(--positive)';
    else if (polarity < -0.25) colorVar = 'var(--negative)';
    else colorVar = 'var(--text-muted)';

    tr.innerHTML = `
        <td>${text}</td>
        <td class="polarity-cell" style="color: ${colorVar}">${polarityStr}</td>
    `;

    tbody.prepend(tr);
}

function renderVideoDetails(data) {
    document.getElementById('thumb').src = data.thumbnails.url;
    const videoUrl = `https://www.youtube.com/watch?v=${data.videoId}`;

    document.getElementById('thumb-link').href = videoUrl; // Set thumb link
    ELEMENTS.videoLink.href = videoUrl; // Set title link

    document.querySelector('.video-info h2').firstChild.textContent = data.title + " "; // Keep icon
    document.querySelector('.channel-name').innerText = "Video ID: " + data.videoId;

    // Stats
    document.getElementById('stat-views').innerText = parseInt(data.statistics.viewCount).toLocaleString();
    document.getElementById('stat-likes').innerText = parseInt(data.statistics.likeCount).toLocaleString();
    document.getElementById('stat-comments').innerText = parseInt(data.statistics.commentCount).toLocaleString();

    ELEMENTS.videoSection.classList.remove('hidden');
}

function filterComments(sentimentId) {
    // sentimentId is passed as 'list-positive', 'list-neutral', etc. from data-tab
    document.querySelectorAll('.comments-list').forEach(el => el.classList.add('hidden'));

    const target = document.getElementById(sentimentId);
    if (target) {
        target.classList.remove('hidden');
    }
}

function resetUI() {
    stopPolling();
    commentCache.clear();
    sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    totalProcessed = 0;

    document.getElementById('tbody-positive').innerHTML = '';
    document.getElementById('tbody-neutral').innerHTML = '';
    document.getElementById('tbody-negative').innerHTML = '';

    updateChart();

    ELEMENTS.errorMsg.style.display = 'none';
    hideSections();
}

function hideSections() {
    ELEMENTS.videoSection.classList.add('hidden');
    ELEMENTS.chartSection.classList.add('hidden');
    ELEMENTS.commentsSection.classList.add('hidden');
}

function showSpinner(show) {
    ELEMENTS.spinner.style.display = show ? 'block' : 'none';
}

function showError(msg) {
    ELEMENTS.errorMsg.innerText = msg;
    ELEMENTS.errorMsg.style.display = 'block';
}
