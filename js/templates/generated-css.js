/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 *
 * 严禁任何个人或机构将本软件及生成的网页用于商业牟利、收费培训或二次打包销售。
 * ====================================================================
 */

export const GENERATED_CSS = `
                body { max-width: 600px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; line-height: 1.6; }
                .date-header { text-align: center; margin: 10px 0 20px 0; font-weight: bold; color: #2c3e50; font-size: 1.2em; }
                .controls { background: #e9ecef; padding: 15px; border-radius: 8px; margin-bottom: 25px; display: flex; flex-wrap: wrap; gap: 15px; }
                .control-group { flex: 1; min-width: 150px; }
                .controls label { display: block; margin-bottom: 5px; font-weight: 500; color: #333; font-size: 0.9em; }
                .controls select { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.95em; box-sizing: border-box; }
                .card { background: #ffffff; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 20px 25px; margin: 20px 0; transition: border-color 0.3s, box-shadow 0.3s; border: 2px solid transparent; position: relative; }
                .card.mastered { border-color: #FFD700; box-shadow: 0 0 20px rgba(255,215,0,0.35), 0 2px 10px rgba(0,0,0,0.1); }
                .explanation-box { background: #eef7ff; border-left: 5px solid #2196F3; padding: 15px 20px; margin: 20px 0; border-radius: 8px; color: #333; line-height: 1.7; font-size: 1.05em; }
                .explanation-box b, .explanation-box strong { color: #1e88e5; }
                .content { margin-bottom: 15px; }
                .english { font-size: 1.2em; color: #2c3e50; margin-bottom: 10px; line-height: 1.6; display: none; cursor: default; position: relative; }
                .english.visible { display: block; }
                .word-span {
                    display: inline-block;
                    cursor: pointer;
                    transition: background-color 0.2s ease, color 0.2s ease;
                    border-radius: 3px;
                    padding: 0 2px;
                    position: relative;
                    z-index: 10;
                    pointer-events: auto !important;
                }
                .word-span:hover {
                    background-color: rgba(255, 235, 59, 0.4);
                    color: #0d47a1;
                }
                .chinese {
                    font-size: 1.1em;
                    color: #34495e;
                    padding-left: 15px;
                    position: relative;
                    font-style: italic;
                    user-select: none;
                }
                .chinese::before { content: '» '; position: absolute; left: 0; top: 1px; color: #777; }
                .reveal-btn { display: inline-block; background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 0.95em; transition: background-color 0.3s ease; }
                .reveal-btn:hover { background-color: #1976D2; }
                .reveal-btn.locked { background-color: #ccc !important; cursor: not-allowed; opacity: 0.6; }
                .reveal-btn.playing { background-color: #FF9800 !important; cursor: wait; opacity: 0.8; }
                .reveal-btn.revealed-once { background-color: #4CAF50; }
                /* 整句朗读期间锁定单词点读：点词会 cancel() 掉 TTS 队列，
                   onend 随之丢失，按钮会悬挂在「播放中...」 */
                .card.is-playing .word-span { pointer-events: none !important; cursor: default !important; }
                .card.is-playing .word-span:hover { background-color: transparent !important; color: inherit !important; }
                .energy-bar { display: flex; gap: 10px; margin-top: 12px; justify-content: center; align-items: center; }
                .ear-icon { font-size: 1.6em; filter: grayscale(1); opacity: 0.3; transition: all 0.4s ease; transform: scale(0.9); }
                .ear-icon.lit { filter: grayscale(0); opacity: 1; transform: scale(1.1); animation: earBounce 0.4s ease; }
                @keyframes earBounce { 0% { transform: scale(0.9); } 50% { transform: scale(1.3); } 100% { transform: scale(1.1); } }

                /* ===== 同伴抢答气泡（阶段 1） ===== */
                .peer-bubble {
                    position: relative;
                    margin: 0 0 14px;
                    padding: 14px 16px;
                    border-radius: 16px;
                    background: #eef7ff;
                    border: 1px solid #cfe6ff;
                    transition: opacity 0.24s ease, transform 0.24s ease;
                }
                .peer-head { font-size: 0.92em; color: #456; margin-bottom: 10px; }
                .peer-avatar { font-size: 1.4em; margin-right: 4px; vertical-align: middle; }
                .peer-name { font-weight: 600; color: #2c3e50; }
                .peer-body { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
                .peer-chunks { display: flex; flex-wrap: wrap; gap: 8px; flex: 1 1 100%; }
                .peer-chunk {
                    background: #fff;
                    border: 1px solid #cfe0f5;
                    border-radius: 999px;
                    padding: 9px 15px;
                    font-size: 1em;
                    font-family: inherit;
                    color: #2c3e50;
                    cursor: pointer;
                    transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
                }
                .peer-chunk:hover:not(:disabled) { border-color: #90caf9; background: #f7fbff; transform: translateY(-1px); }
                .peer-chunk:disabled { cursor: default; opacity: 0.75; }
                .peer-ok {
                    margin-top: 2px;
                    background: #e8f5e9;
                    border: 1px solid #a5d6a7;
                    border-radius: 999px;
                    padding: 9px 16px;
                    font-size: 0.95em;
                    font-family: inherit;
                    color: #2e7d32;
                    cursor: pointer;
                    transition: background 0.2s ease, border-color 0.2s ease;
                }
                .peer-ok:hover:not(:disabled) { background: #dcedc8; border-color: #81c784; }
                .peer-ok:disabled { cursor: default; opacity: 0.75; }
                .peer-feedback { margin-top: 10px; font-size: 0.9em; line-height: 1.55; }
                .peer-feedback.success { color: #2e7d32; }
                .peer-feedback.warn { color: #b26a00; }
                .peer-badge { display: none; font-size: 0.8em; color: #2e7d32; white-space: nowrap; }
                .peer-bubble.peer-leaving { opacity: 0; transform: translateY(-4px); }
                .peer-bubble.resolved {
                    position: absolute;
                    top: 10px;
                    right: 12px;
                    margin: 0;
                    padding: 5px 10px;
                    border-radius: 999px;
                    background: #e8f5e9;
                    border-color: #c8e6c9;
                    box-shadow: 0 1px 4px rgba(46,125,50,0.12);
                    z-index: 3;
                }
                .peer-bubble.resolved .peer-head,
                .peer-bubble.resolved .peer-body,
                .peer-bubble.resolved .peer-feedback { display: none; }
                .peer-bubble.resolved .peer-badge { display: inline; }
                .peer-bubble.shake { animation: shake 0.6s ease; }
                @keyframes shake { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); } 20%, 40%, 60%, 80% { transform: translateX(6px); } }

                /* 阶段 1 未通过时，下方起手式区域静音等待 */
                .card.peer-pending .start-layout {
                    opacity: 0.4;
                    pointer-events: none;
                    filter: grayscale(0.25);
                }
                .card.peer-pending .start-slot { border-style: dashed; }

                /* Hint message (auto-fade) */
                .hint-msg { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.85); color: white; padding: 20px 30px; border-radius: 15px; font-size: 1.3em; z-index: 2000; pointer-events: none; animation: hintFade 2s ease forwards; }
                @keyframes hintFade { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8) translateY(-20px); } }

                /* Persistent hint overlay - click to dismiss */
                .persistent-hint-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 3000; cursor: pointer; animation: overlayFadeIn 0.3s ease; }
                @keyframes overlayFadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
                .persistent-hint-box { background: #1a1a2e; color: white; padding: 30px 35px; border-radius: 20px; max-width: 450px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 2px solid #7c4dff; }
                .persistent-hint-box .hint-main { font-size: 1.2em; line-height: 1.6; margin-bottom: 15px; }
                .persistent-hint-box .hint-sub { font-size: 0.85em; color: #aaa; }

                /* Canvas confetti */
                #confetti-canvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1000; }

                /* Reward Area */
                .reward-area { text-align: center; margin-top: 30px; padding: 20px; }
                .reward-hint { font-size: 1.1em; color: #e67e22; margin-bottom: 15px; }
                .reward-btn { background: linear-gradient(135deg, #f093fb, #f5576c); color: white; border: none; padding: 18px 36px; border-radius: 50px; cursor: pointer; font-size: 1.3em; font-weight: bold; transition: transform 0.3s, box-shadow 0.3s; box-shadow: 0 4px 15px rgba(245,87,108,0.4); }
                .reward-btn:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(245,87,108,0.6); }
                .reward-btn:active { transform: scale(0.98); }
                .reset-btn { background: #b0bec5; color: #37474f; border: none; padding: 10px 20px; border-radius: 25px; cursor: pointer; font-size: 0.9em; margin-top: 10px; transition: background 0.3s; }
                .reset-btn:hover { background: #90a4ae; }
                .hidden { display: none !important; }
                .star-display { margin-top: 20px; padding: 30px; background: linear-gradient(135deg, #fff9e6, #fff3cd); border: 2px solid #ffc107; border-radius: 20px; box-shadow: 0 4px 15px rgba(255,193,7,0.3); animation: fadeInUp 0.6s ease; }
                .star-rating { font-size: 3em; margin: 15px 0; letter-spacing: 5px; }
                .star-content h2 { color: #e67e22; margin: 0; }
                #medal-message { font-size: 1.2em; color: #2c3e50; margin: 10px 0; }
                .save-hint { font-size: 1em; color: #e67e22; margin-top: 15px; font-style: italic; }
                #confetti-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1000; overflow: hidden; }
                .confetti-piece { position: absolute; top: -10px; opacity: 0.9; animation: confettiFall linear forwards; }
                @keyframes confettiFall { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
                @keyframes fadeInUp { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }
                @keyframes pulse { 0% { text-shadow: 0 0 5px #bf5af2, 0 0 10px #bf5af2; } 50% { text-shadow: 0 0 15px #bf5af2, 0 0 25px #bf5af2, 0 0 35px #bf5af2; } 100% { text-shadow: 0 0 5px #bf5af2, 0 0 10px #bf5af2; } }
                .moon-glow { animation: pulse 2s infinite; display: inline-block; filter: grayscale(1) brightness(1.5) drop-shadow(0 0 8px #bf5af2); }

                /* ===== 家长审计区（默认收起） ===== */
                .parent-zone { margin: 8px 0 34px; text-align: center; }
                .parent-zone-toggle {
                    background: none;
                    border: none;
                    color: #c2c8cf;
                    font-size: 0.78em;
                    letter-spacing: 0.08em;
                    padding: 6px 12px;
                    cursor: pointer;
                    transition: color 0.2s ease;
                }
                .parent-zone-toggle:hover,
                .parent-zone-toggle:focus-visible { color: #8d97a2; }
                .parent-zone-body {
                    margin-top: 8px;
                    padding: 14px;
                    background: #fbfbfc;
                    border: 1px solid #e6e8eb;
                    border-radius: 12px;
                    text-align: left;
                    animation: fadeInUp 0.3s ease;
                }
                .parent-toolbar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
                .weak-btn {
                    background: #fff;
                    color: #4a5568;
                    border: 1px solid #dde1e6;
                    border-radius: 999px;
                    padding: 8px 14px;
                    font-size: 0.9em;
                    cursor: pointer;
                    transition: background 0.2s ease, border-color 0.2s ease;
                }
                .weak-btn:hover { background: #f4f5f7; border-color: #cfd5db; }
                .parent-hint { color: #98a2ad; font-size: 0.78em; margin: 12px 0 8px; text-align: center; }
                .weak-mark-list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow: auto; }
                .weak-mark {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    padding: 8px 10px;
                    background: #fff;
                    border: 1px solid #eef0f2;
                    border-radius: 8px;
                }
                .weak-mark-main { flex: 1; min-width: 0; }
                .weak-mark-en { color: #3d4a57; font-size: 0.92em; line-height: 1.45; word-break: break-word; }
                .weak-mark-meta { color: #98a2ad; font-size: 0.76em; margin-top: 3px; }
                .weak-dot {
                    flex: 0 0 auto;
                    width: 16px;
                    height: 16px;
                    margin-top: 3px;
                    padding: 0;
                    border-radius: 50%;
                    border: 1px solid #d2d7dc;
                    background: #fff;
                    cursor: pointer;
                    transition: background 0.2s ease, border-color 0.2s ease;
                }
                .weak-dot:hover { border-color: #aab3bd; }
                .weak-dot:focus-visible { outline: 2px solid #c3cbd4; outline-offset: 2px; }
                .weak-dot.on { background: #a9b3bd; border-color: #a9b3bd; }
                .weak-empty { text-align: center; color: #98a2ad; margin: 6px 0; font-size: 0.85em; }
                .parent-reset { display: block; text-align: center; margin-top: 14px; color: #c9cfd6; font-size: 0.74em; text-decoration: none; }
                .parent-reset:hover { color: #9aa4af; }
                @media (max-width: 768px) {
                    .parent-toolbar { flex-direction: column; }
                    .weak-btn { width: 100%; }
                    .weak-mark-list { max-height: 280px; }
                }

                /* ===== 统一卡片「起手式」布局（阶段 2） ===== */
                .start-layout {
                    display: grid;
                    grid-template-columns: minmax(84px, 34%) 1fr;
                    gap: 12px;
                    align-items: stretch;
                    transition: opacity 0.3s ease, filter 0.3s ease;
                }
                .start-starters {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    justify-content: center;
                    align-items: flex-start;
                    padding: 12px;
                    background: #f7f9fc;
                    border-radius: 12px;
                }
                .start-label {
                    font-size: 0.72em;
                    letter-spacing: 0.12em;
                    color: #98a2ad;
                }
                .starter-chip {
                    background: #fff;
                    border: 1px solid #d8e0ea;
                    border-radius: 999px;
                    padding: 8px 14px;
                    font-size: 1em;
                    font-family: inherit;
                    color: #2c3e50;
                    cursor: pointer;
                    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease, transform 0.2s ease;
                }
                .starter-chip:hover:not(:disabled) { border-color: #90caf9; transform: translateY(-1px); }
                .starter-chip.chosen {
                    background: #e3f2fd;
                    border-color: #2196F3;
                    color: #0d47a1;
                    font-weight: 600;
                }
                .start-slot {
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 10px;
                    min-height: 84px;
                    padding: 12px;
                    border: 1px dashed #cfd8e3;
                    border-radius: 12px;
                    background: #fbfcfe;
                    transition: border-color 0.3s ease, background 0.3s ease;
                }
                .start-slot.ready { border-color: #90caf9; background: #f3f9ff; }
                .english { display: none; margin: 0; }
                .english.visible {
                    display: block;
                    animation: startSentenceIn 0.45s ease both;
                }
                @keyframes startSentenceIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .start-slot-btn {
                    width: 100%;
                    padding: 10px 12px;
                    font-size: 0.92em;
                    background: #fff;
                    color: #4a5568;
                    border: 1px solid #dde1e6;
                    border-radius: 10px;
                }
                .start-slot-btn:hover:not(:disabled) { background: #f4f7fb; }
                .start-slot-btn.revealed-once {
                    background: #4CAF50;
                    border-color: #4CAF50;
                    color: #fff;
                }
                @media (max-width: 480px) {
                    .start-layout { grid-template-columns: 1fr; }
                    .start-starters { flex-direction: row; flex-wrap: wrap; align-items: center; }
                }
`;
