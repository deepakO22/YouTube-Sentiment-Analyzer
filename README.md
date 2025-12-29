# YouTube Insight AI - Advanced Sentiment Analysis

![Project Banner](https://img.shields.io/badge/Status-Active-success)

A powerful analytics tool designed to decode audience feedback by instantly classifying comments into positive, neutral, and negative sentiments. This tool transforms raw opinions into actionable insights, helping you understand viewer needs and learn from constructive criticism. Ultimately, it guides data-driven content decisions to better align with your community's interests.

**Author**: deepakO22

## 🚀 Features

*   **Dual-Mode Analysis**:
    *   **Pro Mode**: Uses Hugging Face API (RoBERTa/BERT models) for high-accuracy, server-side analysis.
    *   **Free Mode**: automatically falls back to an in-browser TensorFlow.js model if no API token is provided. No payment needed!
*   **Live Chat Support**: Real-time polling and analysis for YouTube Live streams.
*   **Visual Insights**: Interactive Doughnut Charts and Sentiment Bars.
*   **Polarity Scoring**: Detailed confidence scores (-1.0 to +1.0) for every comment.
*   **Multilingual**: Supports sentiment analysis in multiple languages.

---

## 🛠️ Installation & Setup

Follow these steps to get running in minutes!

### 1. Clone the Repository
```bash
git clone https://github.com/deepakO22/YouTube-Sentiment-Analyzer.git
cd YouTube-Sentiment-Analyzer
```

### 2. Install Dependencies
This project uses PHP for the backend. You need to install the required libraries using **Composer**.
*(If you don't have Composer, download it from [getcomposer.org](https://getcomposer.org/))*

```bash
composer install
```
*This command will create a `vendor` folder containing the Google YouTube API client and PHP Dotenv library.*

### 3. Usage
You can run this project using the built-in PHP server (easiest method) or any web server like Apache/Nginx.

**Run locally:**
```bash
php -S localhost:8000
```
Open your browser and go to: `http://localhost:8000`

---

## 🔑 API Configuration (Optional but Recommended)

To fetch data from YouTube, you typically need an API Key.

1.  **Create a `.env` file** in the root directory.
2.  Add your keys as follows:

```ini
# Required for fetching comments
YOUTUBE_API_KEY=your_google_api_key_here

# Optional: For Pro-level Sentiment Analysis (Leave empty to use Free Browser Model)
HF_API_TOKEN=your_hugging_face_token_here
```

*   **Get YouTube Key**: [Google Cloud Console](https://console.cloud.google.com/) -> Create Project -> Enable YouTube Data API v3 -> Create Credentials (API Key).
*   **Get Hugging Face Token**: [Hugging Face](https://huggingface.co/settings/tokens) -> Create Token (Access Level: Read).

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for improvements, feel free to fork the repository.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## 📝 Requirements

*   PHP 7.4 or higher
*   Composer
*   Internet Connection (for CDN assets and API calls)

**Enjoy analyzing!**
