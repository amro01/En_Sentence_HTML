import { GENERATED_CSS } from './generated-css.js';
import { buildGeneratedJS } from './generated-js.js';

export function buildGeneratedHTML(params) {
    const {
        date,
        cardsHTML,
        hasAnyTrap,
        // config values for the embedded JS
        childName,
        practiceId,
        replayThreshold,
        timeThreshold,
        masteryThreshold,
        effectiveChances,
        trapCount,
        trapData
    } = params;

    const jsContent = buildGeneratedJS({
        childName,
        practiceId,
        replayLimit: replayThreshold,
        timeLimit: timeThreshold,
        masteryThreshold,
        detectiveChances: effectiveChances,
        trapCount,
        trapData
    });

    return `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>英语听力练习${hasAnyTrap ? ' - 侦探挑战' : ''} - ${date}</title>
            <style>${GENERATED_CSS}
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
            <script>${jsContent}
            </script>
        </body>
        </html>
    `;
}
