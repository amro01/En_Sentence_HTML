import { buildGeneratedHTML } from './templates/generated-html.js';

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

// --- Generate Page ---
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

    // Assemble full page via template modules
    const pageTemplate = buildGeneratedHTML({
        date,
        cardsHTML,
        hasAnyTrap,
        childName,
        practiceId,
        replayThreshold,
        timeThreshold,
        masteryThreshold,
        effectiveChances,
        trapCount,
        trapData
    });

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

// Expose to global scope for inline onclick handlers
window.generatePage = generatePage;
window.downloadPage = downloadPage;
