// 「手相を描くクソゲー」用の Gemini プロキシ
// クライアントは画像(base64)だけを送り、プロンプト・モデル・実際のAPIキーはここで固定する。
// これにより、GitHub上の静的HTMLにはGemini APIキーが一切含まれない。

const MODEL = 'gemini-3.6-flash';

const PROMPT = 'あなたはノリの良いインチキ手相占い師です。添付画像は「手のひらのイラストに、ユーザーが指で描いた線」です。線の本数・長さ・形・広がり方を見て、思いっきり面白おかしく手相占いの結果をでっち上げてください。科学的根拠は一切不要、ノリと勢い重視でOKです。日本語で、必ず次のJSON形式のみを出力してください（説明文やマークダウンのコードブロックは不要、JSON以外は一切出力しないこと）。\n' +
  'scoreは画像ごとに大きくばらつかせること。毎回900点台にしてはいけない。線の本数が少ない／単調／雑な場合は100〜500点台、平均的なら400〜750点台くらいに収め、900点を超える高得点は本当に線が多く独創的で複雑な、10回に1回あるかないかの特別な出来のときだけにすること。\n' +
  '{"title":"称号（10文字前後、中二病っぽく煽り気味に）","score":"手相偏差値スコア。0〜999.9の数値のみ、小数第1位まで","line1":"総合運のコメント（1〜2文）","line2":"恋愛運のコメント（1〜2文）","line3":"金運のコメント（1〜2文）","line4":"仕事運のコメント（1〜2文）","warn":"ふざけた警告文を1文"}';

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj, status = 200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {...corsHeaders(), 'Content-Type': 'application/json'}
  });
}

export default {
  async fetch(request, env){
    if(request.method === 'OPTIONS'){
      return new Response(null, {headers: corsHeaders()});
    }
    if(request.method !== 'POST'){
      return jsonResponse({error: 'Method Not Allowed'}, 405);
    }

    let body;
    try{
      body = await request.json();
    }catch{
      return jsonResponse({error: 'invalid json body'}, 400);
    }

    const imageBase64 = body && body.imageBase64;
    if(typeof imageBase64 !== 'string' || imageBase64.length === 0 || imageBase64.length > 4_000_000){
      return jsonResponse({error: 'invalid imageBase64'}, 400);
    }

    let geminiRes;
    try{
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            contents: [{
              parts: [
                {text: PROMPT},
                {inlineData: {mimeType: 'image/png', data: imageBase64}}
              ]
            }],
            generationConfig: {temperature: 1.1, responseMimeType: 'application/json'}
          })
        }
      );
    }catch(err){
      return jsonResponse({error: 'failed to reach Gemini API', detail: String(err)}, 502);
    }

    if(!geminiRes.ok){
      const detail = await geminiRes.text();
      return jsonResponse({error: `Gemini API error (${geminiRes.status})`, detail}, 502);
    }

    const data = await geminiRes.json();
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
      && data.candidates[0].content.parts[0].text;

    if(!text){
      return jsonResponse({error: 'no result text from Gemini'}, 502);
    }

    return new Response(text, {headers: {...corsHeaders(), 'Content-Type': 'application/json'}});
  }
};
