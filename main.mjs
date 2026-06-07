import {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Events,
    StringSelectMenuBuilder,
    EmbedBuilder
} from "discord.js";

import dotenv from "dotenv";
import express from "express";
import fs from "fs";
dotenv.config();

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;

// ==============================
// Discord Client
// ==============================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// 一時データ保存用
client.tempData = {};

// ==============================
// Web Server
// ==============================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot is running!");
});

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

// データ管理用のJSONファイルパス
const FILAMENT_FILE = './filament.json';
const RESERVATION_FILE = './reservations.json';

// JSON読み書きヘルパー関数
function readData(filePath, defaultData = {}) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
        return defaultData;
    }
}

function writeData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(error);
    }
}

// 📦 在庫一覧の埋め込みメッセージを作成するヘルパー関数
function createStockEmbed() {
    const stocks = readData(FILAMENT_FILE, {});
    const embed = new EmbedBuilder()
        .setTitle("📦 フィラメント在庫一覧")
        .setColor("#3498db")
        .setDescription("現在の部室のフィラメント残量です。1本＝1000g(1kg)として換算しています。")
        .setTimestamp();

    const keys = Object.keys(stocks);
    if (keys.length === 0) {
        embed.addFields({ name: "在庫なし", value: "現在登録されているフィラメントはありません。「在庫の追加・編集」ボタンから登録してください。" });
    } else {
        for (const key of keys) {
            const totalWeight = stocks[key];
            const warning = totalWeight <= 200 ? " ⚠️ **残量わずか！** " : "";
            
            const books = Math.floor(totalWeight / 1000);
            const rem = totalWeight % 1000;
            let displayValue = `総量: **${totalWeight}g**\n`;
            if (books > 0) {
                displayValue += `┗ 📦 **${books}本** ＋ ${rem}g ${warning}`;
            } else {
                displayValue += `┗ 📦 0本 ＋ ${rem}g ${warning}`;
            }

            embed.addFields({ name: `🔹 ${key}`, value: displayValue, inline: true });
        }
    }
    return embed;
}

// -----------------------------
// 起動時（重複・増殖防止・完全強化版）
// -----------------------------
client.once(Events.ClientReady, async () => {
    console.log(`ログインしました: ${client.user.tag}`);

    const guilds = client.guilds.cache;

    for (const guild of guilds.values()) {
        const channels = await guild.channels.fetch();
        
        // ① 3Dプリンタ利用申請チャンネルの設定
        const applyChannel = channels.find(ch => ch?.name === "🖨️｜3dプリンタ利用");
        if (applyChannel && applyChannel.isTextBased()) {
            const applyButton = new ButtonBuilder()
                .setCustomId("open_form")
                .setLabel("申請する")
                .setStyle(ButtonStyle.Success);

            const checkButton = new ButtonBuilder()
                .setCustomId("check_stocks_instant")
                .setLabel("在庫確認")
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(applyButton, checkButton);
            
            // 🔍 確実に過去のメッセージを見つけるために取得件数を100件に増やします
            const messages = await applyChannel.messages.fetch({ limit: 100 });
            
            // 🔍 条件をシンプルに「このボットが送信した、かつ『3Dプリンタ利用申請』という文字列が含まれる」に変更
            const oldMsg = messages.find(msg => 
                msg.author.id === client.user.id && 
                msg.content.includes("3Dプリンタ利用申請")
            );

            if (oldMsg) {
                // すでにメッセージがある場合は、ボタン（components）を最新状態に更新するだけ
                await oldMsg.edit({ components: [row] });
                console.log("🖨️ 3Dプリンタ申請ボタンは既に存在するため、既存メッセージを更新しました。");
            } else {
                // メッセージが過去100件の中に1件もない場合だけ新しく送信する
                await applyChannel.send({
                    content: "🖨️ 3Dプリンタ利用申請\nボタンから申請してください。",
                    components: [row]
                });
                console.log("🖨️ 3Dプリンタ申請ボタンを新しく設置しました。");
            }
        }

        // ② フィラメント管理チャンネルの設定
        const stockChannel = channels.find(ch => ch?.name === "🛠️｜フィラメント管理");
        if (stockChannel && stockChannel.isTextBased()) {
            const manageButton = new ButtonBuilder()
                .setCustomId("manage_stocks_menu")
                .setLabel("在庫の追加・編集")
                .setStyle(ButtonStyle.Primary);

            const checkButton = new ButtonBuilder()
                .setCustomId("check_stocks_instant")
                .setLabel("在庫確認")
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(manageButton, checkButton);
            
            // 🔍 こちらも取得件数を100件に拡張
            const messages = await stockChannel.messages.fetch({ limit: 100 });
            const stockMsg = messages.find(msg => msg.author.id === client.user.id && msg.embeds[0]?.title === "📦 フィラメント在庫一覧");

            const currentEmbed = createStockEmbed();
            if (stockMsg) {
                await stockMsg.edit({ embeds: [currentEmbed], components: [row] });
                console.log("📦 フィラメント在庫一覧は既に存在するため、パネルを更新しました。");
            } else {
                await stockChannel.send({ embeds: [currentEmbed], components: [row] });
                console.log("📦 フィラメント在庫一覧を新しく設置しました。");
            }
        }
    }
});
// ==============================
// Interaction (ボタン / モーダル / セレクトメニュー)
// ==============================
client.on(Events.InteractionCreate, async interaction => {
    try {

        // --------------------------
        // 1. 申請ボタン押下 (モーダルを開く)
        // --------------------------
        if (interaction.isButton() && interaction.customId === "open_form") {

            const modal = new ModalBuilder()
                .setCustomId("reservation_modal")
                .setTitle("🖨️｜3dプリンタ利用");

            const dateInput = new TextInputBuilder()
                .setCustomId("date")
                .setLabel("利用日")
                .setPlaceholder("例: 2026/05/10")
                .setStyle(TextInputStyle.Short);

            const matTypeInput = new TextInputBuilder()
                .setCustomId("mat_type")
                .setLabel("使用材料（種類）")
                .setPlaceholder("例: PLA / PETG / ABS")
                .setStyle(TextInputStyle.Short);

            const matColorInput = new TextInputBuilder()
                .setCustomId("mat_color")
                .setLabel("材料の色")
                .setPlaceholder("例: 白 / 黒 / 透明")
                .setStyle(TextInputStyle.Short);

            const matWeightInput = new TextInputBuilder()
                .setCustomId("mat_weight")
                .setLabel("予定重量 (g) ※数字のみ")
                .setPlaceholder("例: 45")
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder().addComponents(dateInput),
                new ActionRowBuilder().addComponents(matTypeInput),
                new ActionRowBuilder().addComponents(matColorInput),
                new ActionRowBuilder().addComponents(matWeightInput)
            );

            await interaction.showModal(modal);
            return;
        }

        // --------------------------
        // 🔍 在庫一発テキスト確認処理
        // --------------------------
        if (interaction.isButton() && interaction.customId === "check_stocks_instant") {
            const stocks = readData(FILAMENT_FILE, {});
            const keys = Object.keys(stocks);
            
            let replyText = "📊 **現在のフィラメント残量一覧**\n-------------------------\n";
            
            if (keys.length === 0) {
                replyText += "現在登録されているフィラメントはありません。";
            } else {
                for (const key of keys) {
                    const weight = stocks[key];
                    const books = Math.floor(weight / 1000);
                    const rem = weight % 1000;
                    const alert = weight <= 200 ? " ⚠️ **[残りわずか！]**" : "";
                    replyText += `🔹 **${key}** : ${weight}g (${books}本 ＋ ${rem}g)${alert}\n`;
                }
            }
            replyText += "-------------------------\n※印刷が終わったら必ず「利用終了」を押して精算してください。";

            await interaction.reply({ content: replyText, ephemeral: true });
            return;
        }

        // --------------------------
        // 「在庫の追加・編集」メインボタン押下時の処理
        // --------------------------
        if (interaction.isButton() && interaction.customId === "manage_stocks_menu") {
            const modal = new ModalBuilder()
                .setCustomId("stock_name_modal")
                .setTitle("🔧 管理するフィラメントの指定");

            const typeInput = new TextInputBuilder()
                .setCustomId("target_type")
                .setLabel("材料の種類")
                .setPlaceholder("例: PLA")
                .setStyle(TextInputStyle.Short);

            const colorInput = new TextInputBuilder()
                .setCustomId("target_color")
                .setLabel("色")
                .setPlaceholder("例: 白")
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder().addComponents(typeInput),
                new ActionRowBuilder().addComponents(colorInput)
            );

            await interaction.showModal(modal);
            return;
        }

        // --------------------------
        // フィラメント名指定モーダル送信時（3つの操作ボタンを提示）
        // --------------------------
        if (interaction.isModalSubmit() && interaction.customId === "stock_name_modal") {
            const rawType = interaction.fields.getTextInputValue("target_type").toUpperCase().trim();
            const rawColor = interaction.fields.getTextInputValue("target_color").trim();
            const targetKey = `${rawType} (${rawColor})`;

            const addOneButton = new ButtonBuilder()
                .setCustomId(`stockopt_addone_${targetKey}`)
                .setLabel("➕ 1本追加 (1kg)")
                .setStyle(ButtonStyle.Success);

            const removeOneButton = new ButtonBuilder()
                .setCustomId(`stockopt_remone_${targetKey}`)
                .setLabel("➖ 1本削除 (1kg)")
                .setStyle(ButtonStyle.Danger);

            const manualButton = new ButtonBuilder()
                .setCustomId(`stockopt_manual_${targetKey}`)
                .setLabel("重量を微調整・上書き / 削除")
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(addOneButton, removeOneButton, manualButton);

            await interaction.reply({
                content: `📦 対象フィラメント: **${targetKey}**\n行う操作を選択してください。`,
                components: [row],
                ephemeral: true
            });
            return;
        }

        // --------------------------
        // 3つの操作ボタンが押されたときの処理
        // --------------------------
        if (interaction.isButton() && interaction.customId.startsWith("stockopt_")) {
            const [, action, targetKey] = interaction.customId.split('_');
            const stocks = readData(FILAMENT_FILE, {});
            const currentWeight = stocks[targetKey] || 0;

            // ① 1本追加 (1000gプラス)
            if (action === "addone") {
                stocks[targetKey] = currentWeight + 1000;
                writeData(FILAMENT_FILE, stocks);

                const channels = await interaction.guild.channels.fetch();
                const stockChannel = channels.find(ch => ch?.name === "🛠️｜フィラメント管理");
                if (stockChannel) {
                    const messages = await stockChannel.messages.fetch({ limit: 10 });
                    const stockMsg = messages.find(msg => msg.author.id === client.user.id && msg.embeds[0]?.title === "📦 フィラメント在庫一覧");
                    if (stockMsg) await stockMsg.edit({ embeds: [createStockEmbed()] });
                }

                await interaction.update({ content: `✅ **${targetKey}** を **1本(1000g)追加** しました！\n(合計残量: ${stocks[targetKey]}g)`, components: [] });
                return;
            }

            // ② 1本削除 (1000gマイナス)
            if (action === "remone") {
                const newWeight = Math.max(0, currentWeight - 1000);
                if (newWeight <= 0) {
                    delete stocks[targetKey];
                } else {
                    stocks[targetKey] = newWeight;
                }
                writeData(FILAMENT_FILE, stocks);

                const channels = await interaction.guild.channels.fetch();
                const stockChannel = channels.find(ch => ch?.name === "🛠️｜フィラメント管理");
                if (stockChannel) {
                    const messages = await stockChannel.messages.fetch({ limit: 10 });
                    const stockMsg = messages.find(msg => msg.author.id === client.user.id && msg.embeds[0]?.title === "📦 フィラメント在庫一覧");
                    if (stockMsg) await stockMsg.edit({ embeds: [createStockEmbed()] });
                }

                const msg = newWeight <= 0 ? `🗑️ **${targetKey}** は残量が0になったため一覧から削除しました。` : `✅ **${targetKey}** を **1本(1000g)減算** しました。\n(合計残量: ${stocks[targetKey]}g)`;
                await interaction.update({ content: msg, components: [] });
                return;
            }

            // ③ グラム自由入力モーダルを出す
            if (action === "manual") {
                const modal = new ModalBuilder()
                    .setCustomId(`stockmanualmodal_${targetKey}`)
                    .setTitle("重量の微調整・上書き");

                const qtyInput = new TextInputBuilder()
                    .setCustomId("manual_qty")
                    .setLabel(`現在の正しい総重量 (g)を入力 (現在の値: ${currentWeight}g)`)
                    .setPlaceholder("例: 450 ※0にすると完全に一覧から削除されます")
                    .setStyle(TextInputStyle.Short);

                modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
                await interaction.showModal(modal);
                return;
            }
        }

        // --------------------------
        // 微調整モーダルの送信処理
        // --------------------------
        if (interaction.isModalSubmit() && interaction.customId.startsWith("stockmanualmodal_")) {
            const targetKey = interaction.customId.split('_')[1];
            const rawQty = parseInt(interaction.fields.getTextInputValue("manual_qty"));

            const stocks = readData(FILAMENT_FILE, {});

            if (rawQty === 0 || isNaN(rawQty)) {
                delete stocks[targetKey];
                writeData(FILAMENT_FILE, stocks);
                await interaction.reply({ content: `🗑️ **${targetKey}** を在庫一覧から削除しました。`, ephemeral: true });
            } else {
                stocks[targetKey] = rawQty;
                writeData(FILAMENT_FILE, stocks);
                await interaction.reply({ content: `✅ **${targetKey}** の総重量を **${rawQty}g** に変更・上書きしました。`, ephemeral: true });
            }

            const channels = await interaction.guild.channels.fetch();
            const stockChannel = channels.find(ch => ch?.name === "🛠️｜フィラメント管理");
            if (stockChannel) {
                const messages = await stockChannel.messages.fetch({ limit: 10 });
                const stockMsg = messages.find(msg => msg.author.id === client.user.id && msg.embeds[0]?.title === "📦 フィラメント在庫一覧");
                if (stockMsg) await stockMsg.edit({ embeds: [createStockEmbed()] });
            }
            return;
        }

        // --------------------------
        // ボタン操作 (印刷後の利用終了・清算処理)
        // --------------------------
        if (interaction.isButton()) {
            const [action, requestId, weightStr, ...keyParts] = interaction.customId.split('_');
            const weight = parseInt(weightStr) || 0;
            const filamentKey = keyParts.join('_');

            if (action === 'finish') {
                // 【★変更箇所】利用のチャンネルに残さないため、現在の申請用メッセージを完全に削除します
                try {
                    await interaction.message.delete();
                } catch (e) {
                    console.error("メッセージの削除に失敗しました:", e);
                }

                const stocks = readData(FILAMENT_FILE, {});
                let logText = `利用清算処理が完了しました。`;
                let scheduleClearText = `🛑 **利用終了・清算完了**\n【予約ID】${requestId}\n【ユーザー】<@${interaction.user.id}>`;

                if (stocks[filamentKey] !== undefined) {
                    const newWeight = stocks[filamentKey] - weight;

                    if (newWeight <= 0) {
                        delete stocks[filamentKey];
                        writeData(FILAMENT_FILE, stocks);
                        scheduleClearText += `\n📦 在庫消費: **${filamentKey}** を使い切りました（0gになりデータ削除）`;
                    } else {
                        stocks[filamentKey] = newWeight;
                        writeData(FILAMENT_FILE, stocks);
                        const b = Math.floor(newWeight / 1000);
                        const r = newWeight % 1000;
                        scheduleClearText += `\n📦 在庫消費: **${filamentKey}** から **${weight}g** 減算 (残量: ${newWeight}g [${b}本 ＋ ${r}g])`;

                        if (newWeight <= 200) {
                            const channels = await interaction.guild.channels.fetch();
                            const alertChannel = channels.find(ch => ch?.name === "🛠️｜フィラメント管理" || ch?.name === "🖨️｜3Dプリンタ利用");
                            if (alertChannel) {
                                await alertChannel.send(`⚠️ **在庫警告**: **${filamentKey}** の残量が **${newWeight}g** になりました。`);
                            }
                        }
                    }

                    const channels = await interaction.guild.channels.fetch();
                    const stockChannel = channels.find(ch => ch?.name === "🛠️｜フィラメント管理");
                    if (stockChannel) {
                        const messages = await stockChannel.messages.fetch({ limit: 10 });
                        const stockMsg = messages.find(msg => msg.author.id === client.user.id && msg.embeds[0]?.title === "📦 フィラメント在庫一覧");
                        if (stockMsg) await stockMsg.edit({ embeds: [createStockEmbed()] });
                    }
                } else {
                    scheduleClearText += `\n⚠️ 注意: 素材が在庫データに無いため、在庫減算はスキップされました。`;
                }

                // 「🗓️｜利用予定」チャンネルにのみ確定ログをテキストで送信
                const allChannels = await interaction.guild.channels.fetch();
                const scheduleChannel = allChannels.find(ch => ch?.name === "🗓️｜利用予定");
                if (scheduleChannel) {
                    await scheduleChannel.send(scheduleClearText);
                }

                const reservations = readData(RESERVATION_FILE, []);
                const filteredReservations = reservations.filter(res => res.id !== requestId);
                writeData(RESERVATION_FILE, filteredReservations);

                await interaction.reply({ content: logText, ephemeral: true });
                return;
            }
        }

        // --------------------------
        // 2. 申請モーダル送信 (日付形式チェック ＆ 開始時間選択へ)
        // --------------------------
        if (interaction.isModalSubmit() && interaction.customId === "reservation_modal") {

            const dateStr = interaction.fields.getTextInputValue("date");
            const matType = interaction.fields.getTextInputValue("mat_type");
            const matColor = interaction.fields.getTextInputValue("mat_color");
            const matWeight = interaction.fields.getTextInputValue("mat_weight");

            const testDate = new Date(dateStr);
            if (isNaN(testDate.getTime())) {
                await interaction.reply({ content: "❌ 日付形式が正しくありません。 (例: 2026/05/10)", ephemeral: true });
                return;
            }

            client.tempData[interaction.user.id] = {
                date: dateStr,
                matType,
                matColor,
                matWeight
            };

            const startSelect = new StringSelectMenuBuilder()
                .setCustomId("start_time")
                .setPlaceholder("開始時間を選択")
                .addOptions(
                    Array.from({ length: 14 }, (_, i) => {
                        const hour = String(i + 8).padStart(2, '0');
                        return { label: `${hour}:00`, value: `${hour}:00` };
                    })
                );

            await interaction.reply({
                content: "⏰ **開始時間**を選択してください",
                components: [new ActionRowBuilder().addComponents(startSelect)],
                ephemeral: true
            });
            return;
        }

        // --------------------------
        // 3. 開始時間選択 (保持 ＆ 終了時間選択へ)
        // --------------------------
        if (interaction.isStringSelectMenu() && interaction.customId === "start_time") {

            if (!client.tempData[interaction.user.id]) {
                await interaction.reply({ content: "セッションがタイムアウトしました。最初からやり直してください。", ephemeral: true });
                return;
            }

            client.tempData[interaction.user.id].start = interaction.values[0];

            const endSelect = new StringSelectMenuBuilder()
                .setCustomId("end_time")
                .setPlaceholder("終了時間を選択")
                .addOptions(
                    Array.from({ length: 14 }, (_, i) => {
                        const hour = String(i + 9).padStart(2, '0');
                        return { label: `${hour}:00`, value: `${hour}:00` };
                    })
                );

            await interaction.update({
                content: "⏰ **終了時間**を選択してください",
                components: [new ActionRowBuilder().addComponents(endSelect)]
            });
            return;
        }

        // --------------------------
        // 4. 終了時間選択 (時間差チェック ＆ プリンタ選択へ)
        // --------------------------
        if (interaction.isStringSelectMenu() && interaction.customId === "end_time") {

            const data = client.tempData[interaction.user.id];
            if (!data) return;

            const end = interaction.values[0];

            if (end <= data.start) {
                await interaction.update({
                    content: `❌ エラー: 終了時間(${end})は開始時間(${data.start})より後にしてください。ボタンから申請をやり直してください。`,
                    components: []
                });
                delete client.tempData[interaction.user.id];
                return;
            }

            data.end = end;

            const printerSelect = new StringSelectMenuBuilder()
                .setCustomId("place_select")
                .setPlaceholder("使用する3Dプリンタを選択")
                .addOptions([
                    { label: "kadai-printer", value: "kadai-printer" },
                    { label: "kadai-printer2", value: "kadai-printer2" },
                ]);

            await interaction.update({
                content: "使用する**3Dプリンタ**を選択してください",
                components: [new ActionRowBuilder().addComponents(printerSelect)]
            });
            return;
        }

        // --------------------------
        // 5. プリンタ選択 (自動確定・重複チェック警告付き)
        // --------------------------
        if (interaction.isStringSelectMenu() && interaction.customId === "place_select") {

            const data = client.tempData[interaction.user.id];
            if (!data) {
                await interaction.reply({ content: "データが見つかりません。", ephemeral: true });
                return;
            }

            const channel = interaction.channel;
            const printerText = interaction.values[0];

            const matType = data.matType || 'PLA';
            const matColor = data.matColor || '不明';
            const weight = parseInt(data.matWeight) || 0;
            const filamentKey = `${matType.toUpperCase()} (${matColor})`;
            const dateAndTimeText = `• ${data.date} (${data.start} 〜 ${data.end})`;

            const requestId = `REQ-${Date.now().toString().slice(-6)}`;

            const reservations = readData(RESERVATION_FILE, []);
            let duplicateUser = null;
            let duplicateTime = "";

            for (const res of reservations) {
                if (res.date === data.date && res.printer === printerText) {
                    if (data.start < res.end && data.end > res.start) {
                        duplicateUser = res.userId;
                        duplicateTime = `${res.start}～${res.end}`;
                        break;
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🖨️ 3Dプリンタ予約確定 (自動受付)')
                .setTimestamp();

            if (duplicateUser) {
                embed.setColor('#e67e22')
                     .setDescription(`⚠️ **重複警告**: この時間帯は既に <@${duplicateUser}> さん (${duplicateTime}) が予約しています！お互いに調整してください。`);
            } else {
                embed.setColor('#2ecc71');
            }

            const currentStocks = readData(FILAMENT_FILE, {});
            const currentWeight = currentStocks[filamentKey] || 0;
            const books = Math.floor(currentWeight / 1000);
            const rem = currentWeight % 1000;
            const stockStatusStr = currentWeight > 0 ? `${filamentKey} (部室在庫残量: ${currentWeight}g [${books}本 ＋ ${rem}g])` : `${filamentKey} ⚠️注意：部室在庫データにありません`;

            embed.addFields(
                { name: '予約ID', value: requestId, inline: true },
                { name: '予約者', value: `<@${interaction.user.id}>`, inline: true },
                { name: '使用プリンタ', value: printerText, inline: true },
                { name: '利用日・時間', value: dateAndTimeText, inline: false },
                { name: '使用材料・予定量', value: `● ${weight}g 利用予定\n┗ 在庫状況: ${stockStatusStr}`, inline: false }
            );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`finish_${requestId}_${weight}_${filamentKey}`)
                    .setLabel('🛑 利用終了 (在庫減算)')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [embed], components: [row] });

            const allChannels = await interaction.guild.channels.fetch();
            const scheduleChannel = allChannels.find(ch => ch?.name === "🗓️｜利用予定");
            if (scheduleChannel) {
                let scheduleMsg = `📅 **自動予約確定**:\n【予約ID】${requestId}\n${dateAndTimeText}\n【プリンタ】${printerText}\n【ユーザー】<@${interaction.user.id}>`;
                if (duplicateUser) {
                    scheduleMsg += `\n⚠️ *注意: <@${duplicateUser}> さんの予約と時間が重複しています*`;
                }
                await scheduleChannel.send(scheduleMsg);
            }

            reservations.push({
                id: requestId,
                userId: interaction.user.id,
                date: data.date,
                start: data.start,
                end: data.end,
                printer: printerText
            });
            writeData(RESERVATION_FILE, reservations);

            await interaction.update({ content: "予約が確定しました！", components: [] });

            delete client.tempData[interaction.user.id];
        }

    } catch (err) {
        console.error(err);
    }
});

client.on(Events.Error, console.error);

client.login(TOKEN);