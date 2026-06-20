export const GENERATED_CSS = `
                body { max-width: 600px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; line-height: 1.6; }
                .date-header { text-align: center; margin: 10px 0 20px 0; font-weight: bold; color: #2c3e50; font-size: 1.2em; }
                .controls { background: #e9ecef; padding: 15px; border-radius: 8px; margin-bottom: 25px; display: flex; flex-wrap: wrap; gap: 15px; }
                .control-group { flex: 1; min-width: 150px; }
                .controls label { display: block; margin-bottom: 5px; font-weight: 500; color: #333; font-size: 0.9em; }
                .controls select { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.95em; box-sizing: border-box; }
                .card { background: #ffffff; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 20px 25px; margin: 20px 0; transition: border-color 0.3s, box-shadow 0.3s; border: 2px solid transparent; position: relative; }
                .card.mastered { border-color: #FFD700; box-shadow: 0 0 20px rgba(255,215,0,0.35), 0 2px 10px rgba(0,0,0,0.1); }
                .card.trap-caught { border-color: #7c4dff !important; box-shadow: 0 0 20px rgba(124,77,255,0.3) !important; }
                .explanation-box { background: #eef7ff; border-left: 5px solid #2196F3; padding: 15px 20px; margin: 20px 0; border-radius: 8px; color: #333; line-height: 1.7; font-size: 1.05em; }
                .explanation-box b, .explanation-box strong { color: #1e88e5; }
                .content { margin-bottom: 15px; }
                .english { font-size: 1.2em; color: #2c3e50; margin-bottom: 10px; line-height: 1.6; display: none; cursor: default; position: relative; }
                .english.visible { display: block; }
                .english.detectable { cursor: pointer; }
                .english.detectable:hover { background: #f3e8ff; border-radius: 4px; }
                .detective-icon { position: absolute; bottom: 2px; right: 2px; font-size: 0.7em; opacity: 0.2; pointer-events: none; transition: opacity 0.3s; }
                .english:hover .detective-icon { opacity: 0.5; }
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
                    filter: blur(6px);
                    transition: filter 0.3s ease;
                    cursor: help;
                    user-select: none;
                }
                .chinese::before { content: '» '; position: absolute; left: 0; top: 1px; color: #777; }
                .chinese.revealed { filter: blur(0); }
                .reveal-btn { display: inline-block; background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 0.95em; transition: background-color 0.3s ease; }
                .reveal-btn:hover { background-color: #1976D2; }
                .reveal-btn.locked { background-color: #ccc !important; cursor: not-allowed; opacity: 0.6; }
                .reveal-btn.playing { background-color: #FF9800 !important; cursor: wait; opacity: 0.8; }
                .energy-bar { display: flex; gap: 10px; margin-top: 12px; justify-content: center; align-items: center; }
                .ear-icon { font-size: 1.6em; filter: grayscale(1); opacity: 0.3; transition: all 0.4s ease; transform: scale(0.9); }
                .ear-icon.lit { filter: grayscale(0); opacity: 1; transform: scale(1.1); animation: earBounce 0.4s ease; }
                @keyframes earBounce { 0% { transform: scale(0.9); } 50% { transform: scale(1.3); } 100% { transform: scale(1.1); } }
                
                /* Detective Chance Bar */
                .detective-bar { background: linear-gradient(135deg, #e8d5f5, #d1c4e9); padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; font-size: 1.1em; box-shadow: 0 2px 8px rgba(124,77,255,0.15); }
                .detective-bar .chances { display: flex; align-items: center; gap: 8px; }
                .detective-bar .chance-icons { font-size: 1.4em; letter-spacing: 2px; }
                .detective-bar .chance-icons .used { opacity: 0.25; filter: grayscale(1); }
                
                /* Shake animation for false alarm */
                @keyframes shake { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); } 20%, 40%, 60%, 80% { transform: translateX(8px); } }
                .card.shake { animation: shake 0.6s ease; }
                
                /* Flip animation for catching trap */
                .card.flip { perspective: 1000px; }
                .card.flip .content { animation: flipReplace 0.8s ease forwards; }
                @keyframes flipReplace { 0% { transform: rotateX(0); } 50% { transform: rotateX(90deg); opacity: 0.3; } 51% { opacity: 1; } 100% { transform: rotateX(0); } }
                
                .wrong-word { color: #d32f2f; text-decoration: line-through; font-weight: bold; }
                .correct-word { color: #1565c0; font-weight: bold; }
                
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
                #detective-summary { font-size: 1.1em; color: #6a1b9a; margin: 10px 0; padding: 12px; background: #f3e5f5; border-radius: 8px; }
                .save-hint { font-size: 1em; color: #e67e22; margin-top: 15px; font-style: italic; }
                #confetti-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1000; overflow: hidden; }
                .confetti-piece { position: absolute; top: -10px; opacity: 0.9; animation: confettiFall linear forwards; }
                @keyframes confettiFall { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
                @keyframes fadeInUp { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }
                @keyframes pulse { 0% { text-shadow: 0 0 5px #bf5af2, 0 0 10px #bf5af2; } 50% { text-shadow: 0 0 15px #bf5af2, 0 0 25px #bf5af2, 0 0 35px #bf5af2; } 100% { text-shadow: 0 0 5px #bf5af2, 0 0 10px #bf5af2; } }
                .moon-glow { animation: pulse 2s infinite; display: inline-block; filter: grayscale(1) brightness(1.5) drop-shadow(0 0 8px #bf5af2); }
                @media (max-width: 768px) { body { padding: 15px; } .controls { flex-direction: column; gap: 10px; } .card { padding: 15px 20px; } .reveal-btn { width: auto; padding: 8px 16px; } .english { font-size: 1.1em; } .chinese { font-size: 1.0em; } .ear-icon { font-size: 1.4em; } }
                @media (max-width: 480px) { body { padding: 10px; } .reveal-btn { width: 100%; } }
`;
