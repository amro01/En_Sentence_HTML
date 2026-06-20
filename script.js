// --- Auto-populate Date & Card Management ---
(function() {
    function setTodaysDate() { const today = new Date(); const year = today.getFullYear(); const month = String(today.getMonth() + 1).padStart(2, '0'); const day = String(today.getDate()).padStart(2, '0'); document.getElementById('practiceDate').value = `${year}年-${month}月-${day}日`; }
    setTodaysDate();
    const cardsContainer = document.getElementById('cardsContainer');

    // --- Trap toggle handler ---
    window.onTrapToggle = function(checkbox) {
        const card = checkbox.closest('.card-item');
        const extraField = card.querySelector('.trap-extra-field');
        const englishInput = card.querySelector('.english-input');
        const engLabel = card.querySelector('.eng-label');
        
        if (checkbox.checked) {
            card.classList.add('trap-card');
            extraField.classList.add('visible');
            if (engLabel) engLabel.textContent = '故意写错的英文 (孩子看到的)';
        } else {
            card.classList.remove('trap-card');
            extraField.classList.remove('visible');
            if (engLabel) engLabel.textContent = '英文段落 (支持多行及 M:/F: 角色标记)';
        }
        updateDetectiveChances();
    };

    window.updateDetectiveChances = function() {
        const trapCheckboxes = document.querySelectorAll('.trap-checkbox:checked');
        const trapCount = trapCheckboxes.length;
        const chancesInput = document.getElementById('detectiveChances');
        const expected = trapCount * 2;
        chancesInput.value = expected;
    };

    window.addCard = function() {
        const newCard = document.createElement('div');
        newCard.className = 'card-item';
        
        const sortButtons = document.createElement('div');
        sortButtons.className = 'sort-buttons';
        sortButtons.innerHTML = `
            <button type="button" class="sort-btn up" onclick="moveCardUp(this)" title="向上移动">↑</button>
            <button type="button" class="sort-btn down" onclick="moveCardDown(this)" title="向下移动">↓</button>
        `;
        
        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';
        cardContent.innerHTML = `
            <label class="eng-label">英文段落 (支持多行及 M:/F: 角色标记)</label>
            <textarea class="english-input" placeholder="英文段落 (支持多行及 M:/F: 角色标记)"></textarea>
            <textarea class="chinese-input" placeholder="中文翻译"></textarea>
            <div class="trap-checkbox-row">
                <input type="checkbox" class="trap-checkbox" onchange="onTrapToggle(this)">
                <label>🕵️ 设为陷阱句</label>
            </div>
            <div class="trap-extra-field">
                <label class="trap-label">正确的对照英文 (系统判分用)</label>
                <textarea class="correct-english-input" placeholder="此处输入正确的英文对照文本"></textarea>
            </div>
            <button type="button" class="delete-card-btn" onclick="deleteCard(this)">删除此条</button>
        `;
        
        newCard.appendChild(sortButtons);
        newCard.appendChild(cardContent);
        cardsContainer.appendChild(newCard);
        
        updateAllSortButtons();
    };
    
    window.addExplanationBox = function() {
       const newBox = document.createElement('div');
       newBox.className = 'card-item explanation-item';
        
       const sortButtons = document.createElement('div');
       sortButtons.className = 'sort-buttons';
       sortButtons.innerHTML = `
            <button type="button" class="sort-btn up" onclick="moveCardUp(this)" title="向上移动">↑</button>
            <button type="button" class="sort-btn down" onclick="moveCardDown(this)" title="向下移动">↓</button>
        `;
        
       const boxContent = document.createElement('div');
       boxContent.className = 'card-content';
       boxContent.innerHTML = `
            <textarea placeholder="在此输入说明文字..."></textarea>
            <button type="button" class="delete-card-btn" onclick="deleteCard(this)">删除此条</button>
        `;
        
       newBox.appendChild(sortButtons);
       newBox.appendChild(boxContent);
       cardsContainer.appendChild(newBox);
        
       updateAllSortButtons();
    };

    window.deleteCard = function(btn) {
        btn.closest('.card-item')?.remove();
        updateAllSortButtons();
        updateDetectiveChances();
    };
    
    window.moveCardUp = function(button) {
        const card = button.closest('.card-item');
        const prevCard = card.previousElementSibling;
        
        if (prevCard && prevCard.classList.contains('card-item')) {
            cardsContainer.insertBefore(card, prevCard);
            updateAllSortButtons();
        }
    };
    
    window.moveCardDown = function(button) {
        const card = button.closest('.card-item');
        const nextCard = card.nextElementSibling;
        
        if (nextCard && nextCard.classList.contains('card-item')) {
            cardsContainer.insertBefore(nextCard, card);
            updateAllSortButtons();
        }
    };
    
    function updateAllSortButtons() {
        const cards = [...cardsContainer.querySelectorAll('.card-item')];
        
        cards.forEach((card, index) => {
            const upButton = card.querySelector('.sort-btn.up');
            const downButton = card.querySelector('.sort-btn.down');
            
            if (upButton) {
                upButton.disabled = index === 0;
            }
            
            if (downButton) {
                downButton.disabled = index === cards.length - 1;
            }
        });
    }

    // Add label to initial card
    const initialCard = document.querySelector('#cardsContainer .card-item');
    if (initialCard) {
        const content = initialCard.querySelector('.card-content');
        const firstTextarea = content.querySelector('textarea');
        if (firstTextarea) {
            const label = document.createElement('label');
            label.className = 'eng-label';
            label.textContent = '英文段落 (支持多行及 M:/F: 角色标记)';
            content.insertBefore(label, firstTextarea);
            firstTextarea.className = 'english-input';
            const secondTA = firstTextarea.nextElementSibling;
            if (secondTA) secondTA.className = 'chinese-input';
        }
    }
})();

// Cached DOM references for generatePage and downloadPage
const outputCodeEl = document.getElementById('outputCode');
const practiceDateEl = document.getElementById('practiceDate');

// --- Generate Page and Download ---
function generatePage() {
    const date = practiceDateEl.value || '未指定日期';
    const childName = document.getElementById('childName').value || '宝贝';
    const replayThreshold = parseInt(document.getElementById('replayThreshold').value) || 3;
    const timeThreshold = parseInt(document.getElementById('timeThreshold').value) || 15;
    const masteryThreshold = parseInt(document.getElementById('masteryThreshold').value) || 3;
    const detectiveChances = parseInt(document.getElementById('detectiveChances').value) || 0;
    const cards = document.querySelectorAll('#cardsContainer .card-item');
    
    let contentHash = 0;
    cards.forEach(card => {
        const inputs = card.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            const val = input.value || '';
            for (let i = 0; i < val.length; i++) {
                contentHash = ((contentHash << 5) - contentHash) + val.charCodeAt(i);
                contentHash |= 0;
            }
        });
    });
    const cleanDate = date.replace(/[^0-9]/g, '');
    const practiceId = 'STATS_' + cleanDate + '_' + Math.abs(contentHash).toString(36);

    // Collect trap data
    const trapData = [];
    let hasAnyTrap = false;

    let cardsHTML = '';
    cards.forEach((card, index) => {
        if (card.classList.contains('explanation-item')) {
            const explanationText = card.querySelector('textarea')?.value || '';
            if (explanationText.trim() !== '') {
                const formattedText = explanationText.replace(/\n/g, '<br>');
                cardsHTML += `<div class="explanation-box">${formattedText}</div>`;
            }
        } else {
            const textareas = card.querySelectorAll('.card-content textarea');
            const englishInput = card.querySelector('.english-input');
            const chineseInput = card.querySelector('.chinese-input');
            const trapCheckbox = card.querySelector('.trap-checkbox');
            const correctEnglishInput = card.querySelector('.correct-english-input');
            
            const englishText = englishInput ? englishInput.value : '';
            const chineseText = chineseInput ? chineseInput.value : '';
            const isTrap = trapCheckbox ? trapCheckbox.checked : false;
            const correctEnglish = correctEnglishInput ? correctEnglishInput.value : '';
            
            if (englishText.trim() !== '') {
                const encodedEnglish = encodeURIComponent(englishText);
                const encodedCorrect = encodeURIComponent(isTrap && correctEnglish.trim() ? correctEnglish : '');
                const englishDisplay = englishText.replace(/\n/g, '<br>');
                const chineseDisplay = chineseText.replace(/\n/g, '<br>');
                const englishElementId = `english-${index}`;
                
                if (isTrap && correctEnglish.trim()) {
                    hasAnyTrap = true;
                    trapData.push({ index: index, english: englishText, correct: correctEnglish });
                }

                const trapAttr = isTrap ? ` data-trap="true" data-correct="${encodedCorrect}"` : '';
                
                cardsHTML += `
                    <div class="card" data-english="${encodedEnglish}" data-card-index="${index}"${trapAttr}>
                        <div class="content">
                            <div class="chinese" onclick="revealChinese(this)" title="点击看中文">
                                ${chineseDisplay}
                            </div>
                            <div class="english" id="${englishElementId}">${englishDisplay}</div>
                        </div>
                        <button class="reveal-btn locked" onclick="handleRevealBtn(this, '${englishElementId}')" disabled>
                            显示/朗读英文
                        </button>
                        <div class="energy-bar">
                            <span class="ear-icon">🎧</span>
                            <span class="ear-icon">🎧</span>
                            <span class="ear-icon">🎧</span>
                        </div>
                    </div>
                `;
            }
        }
    });

    const trapCount = trapData.length;
    const effectiveChances = trapCount > 0 ? detectiveChances : 0;

    // --- TEMPLATE FOR GENERATED PAGE (v2.0 Detective Challenge) ---
    const pageTemplate = `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>英语听力练习${hasAnyTrap ? ' - 侦探挑战' : ''} - ${date}</title>
            <style>
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
            </style>
        </head>
        <body>
            <div class="date-header">${date}</div>
            
            <!-- Detective Chance Bar (only if traps exist) -->
            <div id="detective-bar" class="detective-bar${hasAnyTrap ? '' : ' hidden'}">
                <span>🔍 侦探搜查</span>
                <div class="chances">
                    <span>剩余机会:</span>
                    <span id="chance-icons" class="chance-icons"></span>
                </div>
            </div>

            <div class="controls">
                <div class="control-group"> <label for="maleVoiceSelect">男生/默认声音:</label> <select id="maleVoiceSelect"> <option value="">加载中...</option> </select> </div>
                <div class="control-group"> <label for="femaleVoiceSelect">女生声音:</label> <select id="femaleVoiceSelect"> <option value="">加载中...</option> </select> </div>
                <div class="control-group"> <label for="speedSelectGenerated">选择语速:</label>
                    <select id="speedSelectGenerated">
                        <option value="0.7" selected>慢速 (0.7x)</option>
                        <option value="0.9">稍慢 (0.9x)</option>
                        <option value="1">正常 (1x)</option>
                        <option value="1.2">稍快 (1.2x)</option>
                        <option value="1.5">快速 (1.5x)</option>
                    </select>
                </div>
            </div>
            ${cardsHTML}
            <div class="reward-area">
                <p class="reward-hint">👑 完成所有练习后，点击下方按钮领取今日勋章！</p>
                <button class="reward-btn" onclick="claimReward()">🎉 完成挑战，领取勋章</button>
                <button class="reset-btn" onclick="resetChallenge()">🧹 清空记录，重新挑战最高评价</button>
                <canvas id="confetti-canvas"></canvas>
                <div id="confetti-container"></div>
                <div id="star-display" class="star-display hidden">
                    <div class="star-content">
                        <h2>🏆 今日评价</h2>
                        <div id="star-rating" class="star-rating"></div>
                        <p id="medal-message"></p>
                        <div id="detective-summary" class="hidden"></div>
                        <p class="save-hint">📁 请将勋章存入"成就文件夹"，满50颗星星换大餐哦！</p>
                    </div>
                </div>
            </div>
            <script>
                // --- 从生成器注入的配置 ---
                const CONFIG = {
                    childName: "${childName}",
                    practiceId: "${practiceId}",
                    replayLimit: ${replayThreshold},
                    timeLimit: ${timeThreshold},
                    masteryThreshold: ${masteryThreshold},
                    detectiveChances: ${effectiveChances},
                    trapCount: ${trapCount},
                    trapData: ${JSON.stringify(trapData)}
                };

                // --- 中英教材常见角色性别字典 ---
                const MALE_NAMES = ['m', 'boy', 'liming', 'li ming', 'daming', 'danny', 'jack', 'tom', 'bob', 'mike', 'john', 'wu binbin', 'wu yifan', 'zoom', 'peter', 'sam', 'ben', 'max', 'leo', 'nick'];
                const FEMALE_NAMES = ['f', 'girl', 'jenny', 'amy', 'lingling','sarah', 'chen jie', 'bai ling', 'mary', 'alice', 'wang mei', 'zip', 'lucy', 'lily', 'emma', 'lisa', 'susan', 'kate', 'ann'];

                // --- 文本解析引擎 ---
                function parseDialogues(text) {
                    const lines = text.split('\\n');
                    const segments = [];
                    lines.forEach(line => {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) return;
                        const match = trimmedLine.match(/^([A-Za-z\\s]+|[\\u4e00-\\u9fa5]+)\\s*[:：]\\s*(.*)$/);
                        if (match) {
                            const roleName = match[1].trim().toLowerCase();
                            const speechText = match[2].trim();
                            if (!speechText) return;
                            let gender = 'male';
                            if (FEMALE_NAMES.includes(roleName)) gender = 'female';
                            segments.push({ text: speechText, gender: gender });
                        } else {
                            segments.push({ text: trimmedLine, gender: 'male' });
                        }
                    });
                    return segments;
                }

                // ============================================================
                //  统一状态管理：所有状态存储在 localStorage.getItem(CONFIG.practiceId)
                // ============================================================
                // appState 结构:
                // {
                //   stats: { [sentenceText]: { replay, time, count, mastery_count } },
                //   trapsState: { [cardIndex]: { isCaught: bool, hasBeenRead: bool, wrongReadCount: number, autoRevealed: bool, isSearched: bool } },
                //   remainingChances: number,
                //   foundTraps: [cardIndex, ...]
                // }
                // ============================================================
const appState = loadAppState();
let sessionStartTime = null;

// Cached DOM references
const cards = document.querySelectorAll('.card');
const chanceIconsEl = document.getElementById('chance-icons');
const starDisplayEl = document.getElementById('star-display');
const starRatingEl = document.getElementById('star-rating');
const medalMsgEl = document.getElementById('medal-message');
const detSummaryEl = document.getElementById('detective-summary');


                function getDefaultAppState() {
                    return {
                        stats: {},
                        trapsState: {},
                        remainingChances: CONFIG.detectiveChances,
                        foundTraps: []
                    };
                }

                function ensureTrapState(parsed, cardIndex) {
                    if (!parsed.trapsState[cardIndex]) {
                        parsed.trapsState[cardIndex] = { isCaught: false, wrongReadCount: 0, autoRevealed: false, isSearched: false };
                    } else {
                        // Migration: ensure all fields exist
                        const t = parsed.trapsState[cardIndex];
                        if (t.wrongReadCount === undefined) t.wrongReadCount = 0;
                        if (t.autoRevealed === undefined) t.autoRevealed = false;
                        if (t.isSearched === undefined) t.isSearched = false;
                    }
                    return parsed;
                }

                function loadAppState() {
                    const saved = localStorage.getItem(CONFIG.practiceId);
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            if (!parsed.trapsState) parsed.trapsState = {};
                            // Initialize trapsState for ALL cards (both trap and normal)
                            document.querySelectorAll('.card[data-english]').forEach(card => {
                                const ci = parseInt(card.dataset.cardIndex);
                                if (!isNaN(ci)) ensureTrapState(parsed, ci);
                            });
                            // Also ensure trapData indices are covered
                            CONFIG.trapData.forEach(t => ensureTrapState(parsed, t.index));
                            if (parsed.remainingChances === undefined) parsed.remainingChances = CONFIG.detectiveChances;
                            if (!parsed.foundTraps) parsed.foundTraps = [];
                            if (!parsed.stats) parsed.stats = {};
                            return parsed;
                        } catch(e) {
                            return getDefaultAppState();
                        }
                    }
                    return getDefaultAppState();
                }

                function saveAppState() {
                    localStorage.setItem(CONFIG.practiceId, JSON.stringify(appState));
                }

                // Convenience getters
                function getStats() { return appState.stats; }
                function getTrapState(cardIndex) { return appState.trapsState[cardIndex] || null; }

                // ============================================================
                //  卡片 UI 更新函数：根据 appState 决定显示内容 (Stealth Mode)
                //  Uncaught traps look EXACTLY like normal sentences.
                //  The ONLY difference: ear icons stay gray on re-read.
                //  No trap-hint class, no energy-hint text, no purple glow.
                // ============================================================
                function updateCardUI(cardIndex) {
                    const card = cards[cardIndex];
                    if (!card) return;

                    const trapState = getTrapState(cardIndex);
                    if (!trapState) return;

                    if (trapState.isCaught) {
                        const trapData = CONFIG.trapData.find(t => t.index === cardIndex);
                        if (trapData) {
                            const englishDiv = card.querySelector('.english');
                            const encodedCorrect = encodeURIComponent(trapData.correct);
                            card.dataset.english = encodedCorrect;
                            card.classList.add('trap-caught');
                            const diffHtml = computeDiff(trapData.english, trapData.correct);
                            englishDiv.innerHTML = diffHtml;
                            const energyBar = card.querySelector('.energy-bar');
                            if (energyBar) updateEnergyBar(energyBar, 0, card);
                        }
                    } else {
                        // === Uncaught trap: NO visual hint at all ===
                        const trapData = CONFIG.trapData.find(t => t.index === cardIndex);
                        if (trapData) {
                            const encodedTrap = encodeURIComponent(trapData.english);
                            card.dataset.english = encodedTrap;
                        }
                    }
                }

                // --- Chance Display (实时更新) ---
                function updateChanceDisplay() {
                    if (!chanceIconsEl) return;
                    const total = CONFIG.detectiveChances;
                    const remaining = appState.remainingChances;
                    const used = total - remaining;
                    let html = '';
                    for (let i = 0; i < total; i++) {
                        html += i < used ? '<span class="used">🔍</span>' : '🔍';
                    }
                    chanceIconsEl.innerHTML = html || '—';
                }

                // --- Canvas Confetti ---
                function startConfetti() {
                    const canvas = document.getElementById('confetti-canvas');
                    if (!canvas) return;
                    const ctx = canvas.getContext('2d');
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                    
                    const pieces = [];
                    const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6b9d','#c44dff','#ff9800','#00bcd4'];
                    const count = 120;
                    
                    for (let i = 0; i < count; i++) {
                        pieces.push({
                            x: Math.random() * canvas.width,
                            y: Math.random() * canvas.height * -1 - 20,
                            w: Math.random() * 10 + 4,
                            h: Math.random() * 6 + 3,
                            color: colors[Math.floor(Math.random() * colors.length)],
                            vx: (Math.random() - 0.5) * 4,
                            vy: Math.random() * 3 + 2,
                            rotation: Math.random() * 360,
                            rotSpeed: (Math.random() - 0.5) * 8,
                            opacity: 1
                        });
                    }
                    
                    let frame = 0;
                    const maxFrames = 150;
                    
                    function animate() {
                        if (frame > maxFrames) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            return;
                        }
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        
                        pieces.forEach(p => {
                            p.x += p.vx;
                            p.y += p.vy;
                            p.vy += 0.08;
                            p.rotation += p.rotSpeed;
                            if (frame > maxFrames - 30) {
                                p.opacity = Math.max(0, (maxFrames - frame) / 30);
                            }
                            
                            ctx.save();
                            ctx.translate(p.x, p.y);
                            ctx.rotate(p.rotation * Math.PI / 180);
                            ctx.globalAlpha = p.opacity;
                            ctx.fillStyle = p.color;
                            ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
                            ctx.restore();
                        });
                        
                        frame++;
                        requestAnimationFrame(animate);
                    }
                    
                    animate();
                }

                // --- Show hint message ---
                function showHint(msg) {
                    const el = document.createElement('div');
                    el.className = 'hint-msg';
                    el.textContent = msg;
                    document.body.appendChild(el);
                    setTimeout(() => el.remove(), 2200);
                }

                // --- Compute diff between wrong and correct text ---
                function computeDiff(wrongText, correctText) {
                    const wrongWords = wrongText.split(/\\s+/);
                    const correctWords = correctText.split(/\\s+/);
                    const maxLen = Math.max(wrongWords.length, correctWords.length);
                    let result = '';
                    for (let i = 0; i < maxLen; i++) {
                        if (i < wrongWords.length && i < correctWords.length) {
                            if (wrongWords[i] !== correctWords[i]) {
                                result += '<span class="wrong-word">' + wrongWords[i] + '</span> ';
                                result += '<span class="correct-word">' + correctWords[i] + '</span> ';
                            } else {
                                result += correctWords[i] + ' ';
                            }
                        } else if (i < wrongWords.length) {
                            result += '<span class="wrong-word">' + wrongWords[i] + '</span> ';
                        } else if (i < correctWords.length) {
                            result += '<span class="correct-word">' + correctWords[i] + '</span> ';
                        }
                    }
                    return result.trim();
                }

                // --- Update detective visual for processed cards ---
                function updateDetectiveVisual(cardIndex) {
                    const card = cards[cardIndex];
                    if (!card) return;
                    const englishDiv = card.querySelector('.english');
                    if (englishDiv) {
                        englishDiv.classList.remove('detectable');
                        englishDiv.style.cursor = 'default';
                        const icon = englishDiv.querySelector('.detective-icon');
                        if (icon) icon.style.display = 'none';
                    }
                }

                // --- Debounce guard for reportTrap ---
                let _reportTrapBusy = false;

                // --- Report a trap (click on english text) - Unified cost + One-search Lock ---
                function reportTrap(cardElement) {
                    if (!cardElement) return;
                    if (_reportTrapBusy) return;
                    _reportTrapBusy = true;
                    setTimeout(() => { _reportTrapBusy = false; }, 300);

                    const cardIndex = parseInt(cardElement.dataset.cardIndex);
                    if (isNaN(cardIndex)) return;

                    // === Ensure trapsState exists for this card ===
                    ensureTrapState(appState, cardIndex);
                    const trapState = getTrapState(cardIndex);
                    if (!trapState) return;

                    // === Lock 1: Already caught/auto-revealed? Block. ===
                    if (trapState.isCaught || trapState.autoRevealed) return;

                    // === Lock 2: Already searched? Block — no cost, no hint. ===
                    if (trapState.isSearched) return;

                    // === Lock 3: No chances left? Show message and block. ===
                    if (appState.remainingChances <= 0) {
                        showHint('搜查机会已耗尽...');
                        return;
                    }

                    // === Step 1: Consume 1 chance (UNIFIED — regardless of trap or not) ===
                    appState.remainingChances = Math.max(0, appState.remainingChances - 1);

                    // === Step 2: Mark card as searched (lock it forever) ===
                    trapState.isSearched = true;

                    // === Step 3: Determine if it's a trap ===
                    const isTrap = cardElement.dataset.trap === 'true';

                    if (isTrap) {
                        // === CATCH! ===
                        trapState.isCaught = true;
                        if (!trapState.autoRevealed) {
                            if (!appState.foundTraps.includes(cardIndex)) {
                                appState.foundTraps.push(cardIndex);
                            }
                        }
                        saveAppState();
                        updateChanceDisplay();
                        updateDetectiveVisual(cardIndex);

                        startConfetti();
                        cardElement.classList.add('flip');
                        setTimeout(() => {
                            updateCardUI(cardIndex);
                            cardElement.classList.remove('flip');
                        }, 50);
                        showHint('🎉 成功抓获陷阱！太厉害了！');
                    } else {
                        // === False alarm: shake + message + visual cleanup ===
                        cardElement.classList.add('shake');
                        setTimeout(() => cardElement.classList.remove('shake'), 700);

                        saveAppState();
                        updateChanceDisplay();
                        updateDetectiveVisual(cardIndex);
                        showHint('🤔 这一句看起来很完美哦！');
                    }
                }

                // --- Initialize detective mode (with isSearched restoration) ---
                function initDetectiveMode() {
                    if (!CONFIG.trapCount || CONFIG.trapCount === 0) return;

                    updateChanceDisplay();

                    // Restore trap card UI state
                    document.querySelectorAll('.card[data-trap="true"]').forEach(card => {
                        const ci = parseInt(card.dataset.cardIndex);
                        if (!isNaN(ci)) updateCardUI(ci);
                    });

                    // Attach detective icons and click handlers
                    cards.forEach(card => {
                        const ci = parseInt(card.dataset.cardIndex);
                        if (isNaN(ci)) return;

                        const trapState = getTrapState(ci);
                        const englishDiv = card.querySelector('.english');
                        if (!englishDiv) return;

                        if (trapState && trapState.isSearched) {
                            // Already searched: remove interactivity right away
                            englishDiv.classList.remove('detectable');
                            englishDiv.style.cursor = 'default';
                        } else {
                            // Not yet searched: make detectable
                            englishDiv.classList.add('detectable');
                            const icon = document.createElement('span');
                            icon.className = 'detective-icon';
                            icon.textContent = '🔍';
                            englishDiv.appendChild(icon);

                            englishDiv.addEventListener('click', function(e) {
                                if (!this.classList.contains('visible')) return;
                                reportTrap(card);
                            });
                        }
                    });
                }

                // 1. 初始化统计数据
                const maleVoiceSelect = document.getElementById('maleVoiceSelect');
                const femaleVoiceSelect = document.getElementById('femaleVoiceSelect');
                const speedSelect = document.getElementById('speedSelectGenerated');
                let availableVoices = [];

                function populateVoiceList() {
                    if (!('speechSynthesis' in window)) {
                        maleVoiceSelect.innerHTML = '<option value="">浏览器不支持语音</option>';
                        femaleVoiceSelect.innerHTML = '<option value="">浏览器不支持语音</option>';
                        return;
                    }
                    availableVoices = speechSynthesis.getVoices().filter(voice => voice.lang.startsWith('en-'));
                    if (availableVoices.length === 0) {
                        const msg = speechSynthesis.getVoices().length === 0 ? '等待语音加载...' : '无可用英文语音';
                        maleVoiceSelect.innerHTML = '<option value="">' + msg + '</option>';
                        femaleVoiceSelect.innerHTML = '<option value="">' + msg + '</option>';
                        return;
                    }
                    maleVoiceSelect.innerHTML = '';
                    femaleVoiceSelect.innerHTML = '';
                    availableVoices.forEach(voice => {
                        const opt1 = document.createElement('option');
                        opt1.textContent = voice.name + ' (' + voice.lang + ')';
                        opt1.value = voice.name;
                        maleVoiceSelect.appendChild(opt1);
                        const opt2 = document.createElement('option');
                        opt2.textContent = voice.name + ' (' + voice.lang + ')';
                        opt2.value = voice.name;
                        femaleVoiceSelect.appendChild(opt2);
                    });
                    const maleKeywords = ['guy', 'christopher', 'eric', 'brian', 'david', 'james', 'microsoft mark', 'microsoft david', 'google uk english male'];
                    let maleIdx = -1;
                    for (const kw of maleKeywords) {
                        maleIdx = availableVoices.findIndex(v => v.name.toLowerCase().includes(kw));
                        if (maleIdx >= 0) break;
                    }
                    if (maleIdx === -1) maleIdx = availableVoices.findIndex(v => v.name.includes('Microsoft') && v.name.includes('Natural'));
                    if (maleIdx === -1) maleIdx = availableVoices.findIndex(v => v.lang === 'en-US');
                    if (maleIdx === -1) maleIdx = 0;
                    if (maleIdx >= 0 && maleVoiceSelect.options.length > maleIdx) maleVoiceSelect.options[maleIdx].selected = true;
                    const femaleKeywords = ['ava', 'jenny', 'aria', 'michelle', 'sara', 'samantha', 'victoria', 'kate', 'zira', 'hazel', 'heather', 'microsoft ava', 'google uk english female'];
                    let femaleIdx = -1;
                    for (const kw of femaleKeywords) {
                        femaleIdx = availableVoices.findIndex(v => v.name.toLowerCase().includes(kw));
                        if (femaleIdx >= 0) break;
                    }
                    if (femaleIdx === -1) femaleIdx = availableVoices.findIndex(v => v.lang === 'en-US');
                    if (femaleIdx === -1) femaleIdx = Math.min(0, availableVoices.length - 1);
                    if (femaleIdx >= 0 && femaleVoiceSelect.options.length > femaleIdx) femaleVoiceSelect.options[femaleIdx].selected = true;
                }

                populateVoiceList();
                if ('speechSynthesis' in window && speechSynthesis.onvoiceschanged !== undefined) {
                    speechSynthesis.onvoiceschanged = populateVoiceList;
                }

                function revealChinese(el) {
                    if (!el.classList.contains('revealed')) {
                        el.classList.add('revealed');
                        const card = el.closest('.card');
                        const btn = card.querySelector('.reveal-btn');
                        btn.classList.remove('locked');
                        btn.disabled = false;
                        const englishText = decodeURIComponent(card.dataset.english);
                        const stats = getStats();
                        if (!stats[englishText]) {
                            stats[englishText] = { replay: 0, time: 0, count: 0, mastery_count: 0 };
                        }
                        sessionStartTime = Date.now();
                        saveAppState();

                        const cardIndex = parseInt(card.dataset.cardIndex);
                        if (!isNaN(cardIndex)) {
                            const trapState = getTrapState(cardIndex);
                            if (trapState && !trapState.isCaught) {
                                saveAppState();
                            }
                        }
                    }
                }

                function updateEnergyBar(energyBar, masteryCount, cardElement) {
                    const ears = energyBar.querySelectorAll('.ear-icon');
                    const count = Math.min(masteryCount, 3);
                    ears.forEach((ear, i) => {
                        if (i < count) ear.classList.add('lit');
                        else ear.classList.remove('lit');
                    });
                    if (masteryCount >= CONFIG.masteryThreshold) cardElement.classList.add('mastered');
                    else cardElement.classList.remove('mastered');
                }

                function handleRevealBtn(btn, elementId) {
                    const chineseDiv = btn.parentElement.querySelector('.chinese');
                    if (!chineseDiv.classList.contains('revealed')) {
                        alert("请先点击中文，思考如何翻译成英文哦！");
                        return;
                    }
                    const card = btn.closest('.card');
                    const englishText = decodeURIComponent(card.dataset.english);
                    const englishDiv = document.getElementById(elementId);
                    if (!englishDiv.classList.contains('visible')) {
                        englishDiv.classList.add('visible');
                        btn.textContent = '再次朗读';
                        btn.style.backgroundColor = '#4CAF50';
                        const stats = getStats();
                        const duration = Math.floor((Date.now() - (sessionStartTime || Date.now())) / 1000);
                        if (!stats[englishText]) stats[englishText] = { replay: 0, time: 0, count: 0, mastery_count: 0 };
                        stats[englishText].time = Math.max(stats[englishText].time, duration);
                        stats[englishText].count += 1;
                        saveAppState();
                        speakTextWithTracking(englishText, card, btn);
                    } else {
                        if (btn.dataset.playing === 'true') {
                            alert("正在朗读中，请稍候...");
                            return;
                        }
                        speakTextWithTracking(englishText, card, btn);
                    }
                }

                function speakTextWithTracking(text, cardElement, btnElement) {
                    if (!('speechSynthesis' in window)) { alert('您的浏览器不支持语音合成功能'); return; }
                    const segments = parseDialogues(text);
                    if (segments.length === 0) return;
                    window.speechSynthesis.cancel();
                    const maleVoiceName = maleVoiceSelect.value;
                    const femaleVoiceName = femaleVoiceSelect.value;
                    const rate = parseFloat(speedSelect.value) || 0.7;
                    btnElement.dataset.playing = 'true';
                    btnElement.disabled = true;
                    btnElement.classList.add('playing');
                    btnElement.textContent = '🔊 播放中...';
                    const energyBar = cardElement.querySelector('.energy-bar');
                    const englishText = decodeURIComponent(cardElement.dataset.english);
                    const stats = getStats();
                    segments.forEach((segment, index) => {
                        const utterance = new SpeechSynthesisUtterance(segment.text);
                        let targetVoice = null;
                        if (segment.gender === 'female' && femaleVoiceName) targetVoice = availableVoices.find(v => v.name === femaleVoiceName);
                        else if (maleVoiceName) targetVoice = availableVoices.find(v => v.name === maleVoiceName);
                        if (targetVoice) { utterance.voice = targetVoice; utterance.lang = targetVoice.lang; }
                        else { utterance.lang = 'en-US'; }
                        utterance.rate = rate;
                        if (index === 0) {
                            utterance.onstart = function() {
                                btnElement.disabled = true;
                                btnElement.textContent = '🔊 播放中...';
                                btnElement.classList.add('playing');
                                btnElement.dataset.playing = 'true';
                            };
                        }
                        if (index === segments.length - 1) {
                            utterance.onend = function() {
                                btnElement.disabled = false;
                                btnElement.textContent = '再次朗读';
                                btnElement.dataset.playing = 'false';
                                btnElement.classList.remove('playing');
                                if (!stats[englishText]) stats[englishText] = { replay: 0, time: 0, count: 0, mastery_count: 0 };
                                stats[englishText].replay += 1;
                                const cardIdx = parseInt(cardElement.dataset.cardIndex);
                                const isUncaughtTrap = cardElement.dataset.trap === 'true' && 
                                    !(appState.trapsState[cardIdx]?.isCaught);
                                // Energy Lock: uncaught traps cannot gain energy
                                if (!isUncaughtTrap) {
                                    stats[englishText].mastery_count += 1;
                                }
                                if (energyBar) updateEnergyBar(energyBar, isUncaughtTrap ? 0 : stats[englishText].mastery_count, cardElement);
                                
                                // === "Two-Strike" auto-reveal logic ===
                                if (isUncaughtTrap && cardIdx !== undefined && !isNaN(cardIdx)) {
                                    ensureTrapState(appState, cardIdx);
                                    const ts = getTrapState(cardIdx);
                                    if (ts) {
                                        ts.wrongReadCount = (ts.wrongReadCount || 0) + 1;
                                        saveAppState();
                                        if (ts.wrongReadCount >= 2) {
                                            setTimeout(() => autoRevealTrap(cardIdx), 500);
                                        }
                                    }
                                } else {
                                    saveAppState();
                                }
                            };
                            utterance.onerror = function() {
                                btnElement.disabled = false;
                                btnElement.textContent = '再次朗读';
                                btnElement.dataset.playing = 'false';
                                btnElement.classList.remove('playing');
                            };
                        }
                        window.speechSynthesis.speak(utterance);
                    });
                }

                // --- Create persistent click-to-dismiss overlay ---
                function showPersistentHint(mainText) {
                    const overlay = document.createElement('div');
                    overlay.className = 'persistent-hint-overlay';
                    overlay.innerHTML = '<div class="persistent-hint-box"><div class="hint-main">'
                        + mainText
                        + '</div><div class="hint-sub">(点击任意位置关闭提示)</div></div>';
                    overlay.addEventListener('click', function() {
                        overlay.remove();
                    });
                    document.body.appendChild(overlay);
                }

                // --- Auto-reveal trap when child reads wrong sentence 2 times (two-strike rule) ---
                function autoRevealTrap(cardIndex) {
                    const trapState = getTrapState(cardIndex);
                    if (!trapState || trapState.isCaught) return;

                    const card = cards[cardIndex];
                    if (!card) return;

                    trapState.isCaught = true;
                    trapState.autoRevealed = true;
                    saveAppState();

                    updateCardUI(cardIndex);
                    updateDetectiveVisual(cardIndex);

                    showPersistentHint('🕵️ 发现潜伏的错句！看来它躲过了你的法眼。这是正确的句子，请重新练习吧！');

                    const energyBar = card.querySelector('.energy-bar');
                    if (energyBar) {
                        updateEnergyBar(energyBar, 0, card);
                    }
                }

                // --- 星级评定 ---
                function calculateStars() {
                    const stats = getStats();
                    let total = 0, perfect = 0;
                    const masteredList = [], polishingList = [];
                    let maxReplayCount = 0;
                    let goldenEarSentence = '';
                    let maxReplay = 0;
                    let maxTime = 0;
                    let allWithinHalfTime = true;
                    let allReplayZero = true;
                    for (let key in stats) {
                        const item = stats[key];
                        total++;
                        maxTime = Math.max(maxTime, item.time);
                        maxReplay = Math.max(maxReplay, item.replay);
                        if (item.time > CONFIG.timeLimit * 0.5) allWithinHalfTime = false;
                        if (item.replay > 0) allReplayZero = false;
                        if (item.time <= CONFIG.timeLimit || item.mastery_count >= CONFIG.masteryThreshold) {
                            perfect++;
                            masteredList.push(key);
                        } else {
                            polishingList.push(key);
                        }
                        if (item.replay > maxReplayCount) { maxReplayCount = item.replay; goldenEarSentence = key; }
                    }
                    let stars = 1;
                    if (total > 0) {
                        if (allWithinHalfTime && maxReplay <= 1 && total === Object.keys(stats).length) stars = 6;
                        else if (perfect === total && allReplayZero) stars = 5;
                        else if (perfect === total && !allReplayZero) stars = 4;
                        else { const r = perfect / total; if (r >= 0.8) stars = 4; else if (r >= 0.5) stars = 3; else if (r > 0) stars = 2; else stars = 1; }
                    }
                    // Detective rating: count manually found traps only (exclude auto-revealed)
                    let manuallyFound = 0;
                    if (CONFIG.trapCount > 0) {
                        appState.foundTraps.forEach(tIdx => {
                            const ts = getTrapState(tIdx);
                            if (ts && !ts.autoRevealed) manuallyFound++;
                        });
                    }
                    const totalTraps = CONFIG.trapCount;
                    const allTrapsFound = totalTraps > 0 && manuallyFound >= totalTraps;
                    return { stars, total, perfect, masteredList, polishingList, goldenEarSentence, maxReplayCount, maxReplay, trapsFound: manuallyFound, totalTraps, allTrapsFound };
                }

                function generateReport() {
                    const result = calculateStars();
                    let report = '🏆 恭喜 ' + CONFIG.childName + ' 获得今日英语勋章！\\n\\n';
                    report += '基于设定的标准（重听≤' + CONFIG.replayLimit + '次，思考≤' + CONFIG.timeLimit + '秒 或 打磨次数≥' + CONFIG.masteryThreshold + '次），宝贝的表现如下：\\n\\n';
                    if (result.stars === 6) report += '🌙 至高荣誉：紫金闪耀 6 月亮！（所有句子在半速时间内完成，重听≤1次）\\n\\n';
                    else report += '成就：今日获得 ' + '⭐'.repeat(result.stars) + '（' + result.stars + '颗星）\\n\\n';
                    if (result.masteredList.length > 0) {
                        report += '📗 已点亮的句子（掌握）：\\n这些句子你已经完全掌握了，太棒了！\\n';
                        result.masteredList.forEach(s => {
                            const item = getStats()[s];
                            const isMasteryBased = item.time > CONFIG.timeLimit && item.mastery_count >= CONFIG.masteryThreshold;
                            const label = isMasteryBased ? ' 🎯 地道发音大师' : ' ✅ 优秀';
                            report += '  ' + s + label + '\\n';
                        });
                        report += '\\n';
                    }
                    if (result.polishingList.length > 0) {
                        report += '💪 正在打磨的句子（继续精进）：\\n这 ' + result.polishingList.length + ' 个句子是"明日小怪兽"，建议明天再挑战它们两次！\\n';
                        result.polishingList.forEach(s => report += '  🔄 ' + s + '\\n');
                        report += '\\n';
                    }
                    if (result.maxReplayCount > 0) {
                        report += '👂 特别奖项 - 金耳朵成就 🥇\\n';
                        report += '颁发给听取次数最多的句子：\\n';
                        report += '  🏅 "' + result.goldenEarSentence + '" 共听取 ' + result.maxReplayCount + ' 次\\n\\n';
                    }
                    // Detective report (auto-revealed traps excluded from count)
                    if (CONFIG.trapCount > 0) {
                        report += '🔍 侦探报告：\\n';
                        report += '在 ' + CONFIG.trapCount + ' 个潜伏的错误中，你成功识破了 ' + result.trapsFound + ' 个！';
                        if (result.allTrapsFound) report += ' 🌟 全部抓获，洞察力无与伦比！';
                        report += '\\n\\n';
                    }
                    report += '📊 原始数据：\\n';
                    for (let key in getStats()) {
                        const item = getStats()[key];
                        report += '  ' + key + ' -> 思考' + item.time + '秒, 重听' + item.replay + '次, 练习' + item.count + '次, 打磨' + (item.mastery_count || 0) + '次\\n';
                    }
                    return report;
                }

                function claimReward() {
                    const result = calculateStars();
                    if (result.total === 0) { alert("还没有练习记录，请先完成练习哦！"); return; }

                    // Check for uncaptured traps (not even auto-revealed)
                    const hasUncaughtTraps = CONFIG.trapCount > 0 && CONFIG.trapData.some(t => {
                        const ts = getTrapState(t.index);
                        return !ts || !ts.isCaught;
                    });
                    if (hasUncaughtTraps) {
                        alert('🚨 警报！有潜伏的错误逃脱了你的法眼！再仔细检查一下那些无法积攒能量（耳机不亮）的句子吧！');
                        return;
                    }

                    startConfetti();
                    starDisplayEl.classList.remove('hidden');
                    if (result.stars === 6) starRatingEl.innerHTML = '<span class="moon-glow">🌙🌙🌙🌙🌙🌙</span>';
                    else starRatingEl.textContent = '⭐'.repeat(result.stars);
                    if (CONFIG.trapCount > 0) {
                        const mags = '🔍'.repeat(result.trapsFound);
                        if (mags) starRatingEl.textContent += ' + ' + mags;
                    }
                    const messages = {
                        6: '🚀 超越时空的极速大师！你已经形成了英语反射弧！',
                        5: '🌟 卓越！完美表现，你是英语小天才！',
                        4: '👏 优秀！表现非常棒，继续加油！',
                        3: '💪 加油！多练几次就会更熟练！',
                        2: '👍 不错！明天再挑战一次吧！',
                        1: '🌱 好的开始！每一次练习都在进步！'
                    };
                    let hasMasteryBased = false;
                    if (result.stars === 5) {
                        for (let key in getStats()) {
                            const item = getStats()[key];
                            if (item.time > CONFIG.timeLimit && item.mastery_count >= CONFIG.masteryThreshold) { hasMasteryBased = true; break; }
                        }
                    }
                    const msg = messages[result.stars] || messages[1];
                    if (result.stars === 6) {}
                    else if (hasMasteryBased && result.stars === 5) msg = '🌟 地道发音大师！坚持打磨，发音已臻化境！';
                    medalMsgEl.textContent = msg;
                    if (CONFIG.trapCount > 0) {
                        detSummaryEl.classList.remove('hidden');
                        if (result.allTrapsFound) {
                            detSummaryEl.textContent = '🔍 侦探总结：在 ' + CONFIG.trapCount + ' 个潜伏的错误中，你成功识破了 ' + result.trapsFound + ' 个！神探！这种洞察力真是无与伦比！';
                        } else if (result.trapsFound === 0) {
                            detSummaryEl.textContent = '🔍 侦探总结：哎呀，今天陷阱躲得太深了，下次一定要把它们揪出来哦！';
                        } else {
                            detSummaryEl.textContent = '🔍 侦探总结：在 ' + CONFIG.trapCount + ' 个潜伏的错误中，你成功识破了 ' + result.trapsFound + ' 个！继续加油！';
                        }
                    } else {
                        detSummaryEl.classList.add('hidden');
                    }
                    const report = generateReport();
                    const today = new Date();
                    const dateStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
                    let filename;
                    if (result.stars === 6) filename = dateStr + '_6月极速大师勋章';
                    else if (result.allTrapsFound) filename = dateStr + '_' + result.stars + '星勋章_超级侦探';
                    else filename = dateStr + '_' + result.stars + '星勋章';
                    filename += '.txt';
                    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    starDisplayEl.scrollIntoView({ behavior: 'smooth' });
                }

                function resetChallenge() {
                    if (confirm('宝贝，准备好清空记录，重新冲击 6 枚月亮了吗？')) {
                        localStorage.removeItem(CONFIG.practiceId);
                        location.reload();
                    }
                }

                // --- Full refresh persistence: restore UI from appState ---
                function refreshPersist() {
                    const stats = getStats();

                    cards.forEach(card => {
                        const ci = parseInt(card.dataset.cardIndex);
                        if (isNaN(ci)) return;

                        const englishText = decodeURIComponent(card.dataset.english);
                        const statItem = stats[englishText];
                        const trapState = getTrapState(ci);
                        const chineseDiv = card.querySelector('.chinese');
                        const englishDiv = card.querySelector('.english');
                        const btn = card.querySelector('.reveal-btn');
                        const energyBar = card.querySelector('.energy-bar');

                        // === 1. Translation / stats-based recovery ===
                        if (statItem) {
                            // Reveal translation
                            if (chineseDiv) chineseDiv.classList.add('revealed');
                            // Unlock button
                            if (btn) {
                                btn.classList.remove('locked');
                                btn.disabled = false;
                            }

                            if (statItem.count > 0) {
                                // Show english text if it was visible before (count > 0 means user already saw it)
                                if (englishDiv) {
                                    englishDiv.classList.add('visible');
                                }
                                // Update button text
                                if (btn) {
                                    btn.textContent = '再次朗读';
                                    btn.style.backgroundColor = '#4CAF50';
                                }
                                // Restore energy bar
                                if (energyBar && statItem.mastery_count > 0) {
                                    updateEnergyBar(energyBar, statItem.mastery_count, card);
                                }
                            }
                        }

                        // === 2. Trap error-correction state recovery ===
                        if (trapState && (trapState.isCaught || trapState.autoRevealed)) {
                            const trapData = CONFIG.trapData.find(t => t.index === ci);
                            if (trapData) {
                                const encodedCorrect = encodeURIComponent(trapData.correct);
                                card.dataset.english = encodedCorrect;
                                card.classList.add('trap-caught');
                                if (englishDiv) {
                                    const diffHtml = computeDiff(trapData.english, trapData.correct);
                                    englishDiv.innerHTML = diffHtml;
                                    englishDiv.classList.add('visible');
                                }
                                if (energyBar) updateEnergyBar(energyBar, 0, card);
                                if (chineseDiv) chineseDiv.classList.add('revealed');
                                if (btn) {
                                    btn.classList.remove('locked');
                                    btn.disabled = false;
                                }
                            }
                        }

                        // === 3. Restore detective visual: if searched, remove interactivity ===
                        if (trapState && trapState.isSearched) {
                            updateDetectiveVisual(ci);
                        }
                    });
                }

                function initPage() {
                    // Step 1: For uncaught traps, set the displayed english to the trap text
                    CONFIG.trapData.forEach(t => {
                        const card = cards[t.index];
                        if (card) {
                            const trapState = getTrapState(t.index);
                            if (trapState && !trapState.isCaught) {
                                const encodedTrap = encodeURIComponent(t.english);
                                card.dataset.english = encodedTrap;
                            }
                        }
                    });

                    // Step 2: Restore all UI state from appState
                    refreshPersist();

                    // Step 3: Init detective mode (chance bar, icons, click handlers)
                    initDetectiveMode();
                }

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                        initPage();
                    });
                } else {
                    initPage();
                }
            </script>
        </body>
        </html>
    `;
    outputCodeEl.value = pageTemplate;
    outputCodeEl.readOnly = false;
}

function downloadPage() {
    const code = outputCodeEl.value;
    if (!code) { alert('请先生成网页代码'); return; }
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateValue = practiceDateEl.value || '新练习';
    const safeDate = dateValue.replace(/[^a-zA-Z0-9\u4e00-\u9fa5年\u6708\u65e5-]+/g, '_');
    a.href = url;
    a.download = `练习_${safeDate}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
