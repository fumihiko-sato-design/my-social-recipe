import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface LinkMetadata {
  title: string;
  description: string;
  platform: string;
  contentType: string;
  tags: string[];
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `このURLを分析してください: ${url}。
  以下の情報を日本語のJSON形式で提供してください:
  - title: コンテンツの正確かつ魅力的なタイトル（特に動画の場合は動画タイトルを正確に抽出してください）。
  - description: コンテンツの短い要約。
  - platform: SNSプラットフォーム名 (facebook, tiktok, instagram, youtube, x, または other)。
  - contentType: (news (ニュース), video (動画), product (商品), profile (プロフィール), tutorial (解説), meme (ネタ), other (その他)) のいずれか。
  - tags: コンテンツを要約する3〜5個の日本語キーワードの配列。
  
  内容にアクセスできない場合は、URL構造から推測して提供してください。`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            platform: { type: Type.STRING },
            contentType: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["title", "description", "platform", "contentType", "tags"],
        },
      },
    });

    if (!response.text) {
      throw new Error("Geminiからのレスポンスがありません");
    }

    return JSON.parse(response.text) as LinkMetadata;
  } catch (error) {
    console.error("Geminiメタデータ取得エラー:", error);
    // Fallback detection
    const lowerUrl = url.toLowerCase();
    let platform = "other";
    if (lowerUrl.includes("facebook.com")) platform = "facebook";
    else if (lowerUrl.includes("tiktok.com")) platform = "tiktok";
    else if (lowerUrl.includes("instagram.com")) platform = "instagram";
    else if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) platform = "youtube";
    else if (lowerUrl.includes("x.com") || lowerUrl.includes("twitter.com")) platform = "x";

    return {
      title: "保存済みリンク",
      description: "あなたが保存したリンクです",
      platform,
      contentType: "other",
      tags: ["保存済み", platform],
    };
  }
}
