/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 */

import { GENERATED_CSS } from './generated-css.js';
import { buildGeneratedJS } from './generated-js.js';

export function buildGeneratedHTML(params) {
    const {
        date,
        cardsHTML,
        totalSentences,
        // config values for the embedded JS
        childName,
        practiceId,
        replayThreshold,
        timeThreshold,
        masteryThreshold,
        parentLockEnabled,
        parentPasscode,
        generatorUrl,
        weakThreshold,
        fastThreshold
    } = params;

    const sentenceCount = Number.isFinite(totalSentences)
        ? totalSentences
        : (String(cardsHTML || '').match(/class="card"/g) || []).length;

    const jsContent = buildGeneratedJS({
        childName,
        practiceId,
        replayLimit: replayThreshold,
        timeLimit: timeThreshold,
        masteryThreshold,
        parentLockEnabled,
        parentPasscode,
        generatorUrl,
        weakThreshold,
        fastThreshold,
        totalSentences: sentenceCount
    });

    return `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>英语听力练习 - ${date}</title>
            <style>${GENERATED_CSS}
            </style>
        </head>
        <body>
            <div class="date-header">${date}</div>

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
                        <p class="save-hint">📁 请将勋章存入"成就文件夹"，满50颗星星换大餐哦！</p>
                    </div>
                </div>
            </div>

            <!-- 家长审计区：默认收起，孩子端不出现任何复习/错题字样 -->
            <div id="parent-zone" class="parent-zone">
                <button type="button" id="parent-zone-toggle" class="parent-zone-toggle" aria-expanded="false" aria-controls="parent-zone-body" onclick="WeakReview.toggleParentZone()">家长审计</button>
                <div id="parent-zone-body" class="parent-zone-body hidden">
                    <div class="parent-toolbar">
                        <button type="button" id="weak-copy-btn" class="weak-btn" onclick="WeakReview.copyPack()">📋 复制错题包</button>
                        <button type="button" id="weak-save-btn" class="weak-btn" onclick="WeakReview.downloadPack()">💾 下载错题包</button>
                        <button type="button" id="weak-return-btn" class="weak-btn" onclick="WeakReview.returnToGenerator()">⬅️ 回传生成器</button>
                    </div>
                    <p class="parent-hint">句子右侧圆点 = 加入明日复习清单（孩子端不可见，不影响勋章评价）</p>
                    <p class="parent-hint">💡 将下载的勋章文件放入生成器中设定的【成绩监控目录】，下次打开生成器点「🔄 立即扫描更新」即可自动追踪复习进度。</p>
                    <div id="weak-mark-list" class="weak-mark-list"></div>
                    <a href="#" class="parent-reset" onclick="hardReset();return false;">⚠️ 彻底清除所有记录（含审计数据）</a>
                </div>
            </div>
            <script>${jsContent}
            </script>
            <footer style="text-align:center;margin:30px 0 10px;font-size:0.85em;color:#999;">
                <p>Generated by <a href="https://github.com/amro01/En_Sentence_HTML" target="_blank" style="color:#999;">En_Sentence_HTML</a> v2.8 &copy; 2026</p>
            </footer>
        </body>
        </html>
    `;
}
