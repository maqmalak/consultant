/**
 * English / Urdu for the portal. English strings are the keys (anything untranslated falls back to English);
 * Urdu switches the page to right-to-left with Noto Nastaliq Urdu.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const ur: Record<string, string> = {
  // navigation & common
  "Home": "ہوم",
  "My returns": "میرے ریٹرن",
  "Documents": "دستاویزات",
  "Messages": "پیغامات",
  "Payments": "ادائیگیاں",
  "Profile": "پروفائل",
  "Sign in": "سائن اِن",
  "Sign out": "سائن آؤٹ",
  "Create account": "اکاؤنٹ بنائیں",
  "Save": "محفوظ کریں",
  "Cancel": "منسوخ",
  "Continue": "جاری رکھیں",
  "Back": "واپس",
  "Send": "بھیجیں",
  "Upload": "اپ لوڈ کریں",
  "Re-upload": "دوبارہ اپ لوڈ کریں",
  "Take photo": "تصویر لیں",
  "Download": "ڈاؤن لوڈ",
  "Loading…": "لوڈ ہو رہا ہے…",
  "Something went wrong. Please try again.": "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔",
  "Try again": "دوبارہ کوشش کریں",
  "Language": "زبان",
  // auth
  "Email": "ای میل",
  "Password": "پاس ورڈ",
  "Mobile number": "موبائل نمبر",
  "Full name": "پورا نام",
  "CNIC": "شناختی کارڈ نمبر",
  "City": "شہر",
  "Client type": "کلائنٹ کی قسم",
  "Forgot password?": "پاس ورڈ بھول گئے؟",
  "Send code": "کوڈ بھیجیں",
  "Verification code": "تصدیقی کوڈ",
  "Verify": "تصدیق کریں",
  "We sent a 6-digit code to": "ہم نے 6 ہندسوں کا کوڈ بھیجا ہے",
  "We sent a 6-digit code on WhatsApp to": "ہم نے واٹس ایپ پر 6 ہندسوں کا کوڈ بھیجا ہے",
  "We sent a 6-digit code by SMS to": "ہم نے ایس ایم ایس کے ذریعے 6 ہندسوں کا کوڈ بھیجا ہے",
  "No WhatsApp? Send the code by SMS instead": "واٹس ایپ نہیں؟ کوڈ ایس ایم ایس پر منگوائیں",
  "Resend code": "کوڈ دوبارہ بھیجیں",
  "I agree to the privacy policy and terms": "میں پرائیویسی پالیسی اور شرائط سے متفق ہوں",
  "Already have an account?": "پہلے سے اکاؤنٹ ہے؟",
  "New here?": "نئے ہیں؟",
  // client dashboard
  "Assalam-o-Alaikum": "السلام علیکم",
  "Start filing": "فائلنگ شروع کریں",
  "Your tax returns": "آپ کے ٹیکس ریٹرن",
  "No return yet": "ابھی کوئی ریٹرن نہیں",
  "Choose a package to start your return.": "اپنا ریٹرن شروع کرنے کے لیے پیکیج منتخب کریں۔",
  "Action needed": "آپ کی کارروائی درکار ہے",
  "documents to upload": "دستاویزات اپ لوڈ کرنی ہیں",
  "rejected — please re-upload": "مسترد — دوبارہ اپ لوڈ کریں",
  "Filing deadline": "فائلنگ کی آخری تاریخ",
  "days left": "دن باقی",
  "Your consultant": "آپ کے کنسلٹنٹ",
  "Tax payable": "قابلِ ادا ٹیکس",
  "Refund due": "قابلِ واپسی رقم",
  "Acknowledgment": "رسید",
  // progress steps
  "Account": "اکاؤنٹ",
  "In preparation": "تیاری میں",
  "In review": "جائزہ میں",
  "Your confirmation": "آپ کی تصدیق",
  "Filed": "فائل ہو گیا",
  "Acknowledgment received": "رسید موصول",
  // return page
  "Questions": "سوالات",
  "Summary": "خلاصہ",
  "Do you have salary income?": "کیا آپ کی تنخواہ کی آمدنی ہے؟",
  "Do you have business income?": "کیا آپ کی کاروباری آمدنی ہے؟",
  "Do you earn rent from property?": "کیا آپ کو جائیداد سے کرایہ ملتا ہے؟",
  "Did you sell shares or property (capital gains)?": "کیا آپ نے شیئرز یا جائیداد بیچی؟",
  "Do you earn profit on bank deposits?": "کیا آپ کو بینک ڈپازٹ پر منافع ملتا ہے؟",
  "Do you have income from abroad?": "کیا آپ کی بیرونِ ملک سے آمدنی ہے؟",
  "Any other income?": "کوئی اور آمدنی؟",
  "Do you own property?": "کیا آپ جائیداد کے مالک ہیں؟",
  "Do you own a vehicle?": "کیا آپ گاڑی کے مالک ہیں؟",
  "Is this your first return?": "کیا یہ آپ کا پہلا ریٹرن ہے؟",
  "Yes": "ہاں",
  "No": "نہیں",
  "Required": "لازمی",
  "Optional": "اختیاری",
  "Waiting for upload": "اپ لوڈ کا انتظار",
  "Being checked": "جانچ ہو رہی ہے",
  "Verified": "تصدیق شدہ",
  "Rejected": "مسترد",
  "Reason": "وجہ",
  "Confirm my return": "میرا ریٹرن تصدیق کریں",
  "Ask a question": "سوال پوچھیں",
  "Estimate only — final tax depends on your complete return.": "صرف تخمینہ — حتمی ٹیکس آپ کے مکمل ریٹرن پر منحصر ہے۔",
  "Total income": "کل آمدنی",
  "Taxable income": "قابلِ ٹیکس آمدنی",
  "Tax liability": "ٹیکس واجب الادا",
  "Tax already deducted": "پہلے سے کٹا ہوا ٹیکس",
  "Advance tax paid": "پیشگی ادا شدہ ٹیکس",
  "Net wealth": "خالص دولت",
  // client status lines
  "Waiting for your documents": "آپ کی دستاویزات کا انتظار ہے",
  "We are preparing your return": "ہم آپ کا ریٹرن تیار کر رہے ہیں",
  "We are updating your return": "ہم آپ کا ریٹرن اپ ڈیٹ کر رہے ہیں",
  "Please confirm your return": "براہ کرم اپنے ریٹرن کی تصدیق کریں",
  "Approved — being filed": "منظور — فائل کیا جا رہا ہے",
  "Submitted on FBR IRIS": "ایف بی آر IRIS پر جمع",
  "Filing in progress": "فائلنگ جاری ہے",
  "Filed — acknowledgment received": "فائل ہو گیا — رسید موصول",
  "Deductions": "کٹوتیاں",
  "Choose a package": "پیکیج منتخب کریں",
  "Notes on this return": "اس ریٹرن پر نوٹس",
  "Please check the figures. When you confirm, a senior consultant approves the return and we file it on FBR IRIS on your behalf.":
    "براہ کرم اعداد و شمار چیک کریں۔ تصدیق کے بعد سینئر کنسلٹنٹ منظوری دیتا ہے اور ہم آپ کی جانب سے ایف بی آر IRIS پر فائل کرتے ہیں۔",
  "Send me updates about my return on WhatsApp": "میرے ریٹرن کی اپ ڈیٹس واٹس ایپ پر بھیجیں",
  "Filing progress": "فائلنگ کی پیش رفت",
  "Current stage": "موجودہ مرحلہ",
  "Needs attention": "توجہ درکار ہے",
  "Account created and mobile verified": "اکاؤنٹ بن گیا اور موبائل کی تصدیق ہو گئی",
  "Documents uploaded and checked": "دستاویزات اپ لوڈ اور چیک ہو گئیں",
  "Consultant prepares the return": "کنسلٹنٹ ریٹرن تیار کرتا ہے",
  "A second consultant checks it": "دوسرا کنسلٹنٹ اسے چیک کرتا ہے",
  "You confirm the summary": "آپ خلاصے کی تصدیق کرتے ہیں",
  "Filed on FBR IRIS": "ایف بی آر IRIS پر فائل",
  "IRIS acknowledgment sent to you": "IRIS رسید آپ کو بھیج دی گئی",
  "My details": "میری تفصیلات",
  "Tell us about your year in your own words.": "اپنے سال کے بارے میں اپنے الفاظ میں بتائیں۔",
  "Approximate figures are fine — your consultant checks everything against your documents before anything is filed.": "اندازاً رقم بھی ٹھیک ہے — فائلنگ سے پہلے آپ کا کنسلٹنٹ ہر چیز دستاویزات سے چیک کرتا ہے۔",
  "Salary": "تنخواہ", "Business": "کاروبار", "Rent you receive": "آپ کو ملنے والا کرایہ", "Bank accounts": "بینک اکاؤنٹس",
  "Property you own": "آپ کی جائیداد", "Vehicles": "گاڑیاں", "Other income": "دیگر آمدنی", "Loans you owe": "آپ کے ذمے قرض",
  "Cash and household": "نقد رقم اور گھریلو اخراجات", "Add": "شامل کریں", "Remove": "ہٹائیں",
  "Employer": "آجر (ادارہ)", "Total salary for the year (Rs)": "سال بھر کی کل تنخواہ (روپے)", "Tax deducted by employer (Rs)": "آجر کا کاٹا گیا ٹیکس (روپے)",
  "Bank": "بینک", "Balance on 30 June (Rs)": "30 جون کو بیلنس (روپے)", "Profit earned in the year (Rs)": "سال میں حاصل منافع (روپے)",
  "Tax deducted on profit (Rs)": "منافع پر کٹا ٹیکس (روپے)", "Price paid (Rs)": "ادا کی گئی قیمت (روپے)",
  "Cash at home on 30 June (Rs)": "30 جون کو گھر میں نقد (روپے)", "Household spending per month (Rs)": "ماہانہ گھریلو خرچ (روپے)",
  "Anything else your consultant should know": "کوئی اور بات جو آپ کے کنسلٹنٹ کو معلوم ہونی چاہیے",
  "Save my details": "میری تفصیلات محفوظ کریں", "Saved — your consultant can see it": "محفوظ — آپ کا کنسلٹنٹ اسے دیکھ سکتا ہے",
  "Quick actions": "فوری کام", "Upload documents": "دستاویزات اپ لوڈ کریں", "Check the summary": "خلاصہ چیک کریں",
  "Salary, bank, property…": "تنخواہ، بینک، جائیداد…", "PDF or photo": "پی ڈی ایف یا تصویر", "Pay fee": "فیس ادا کریں",
  "Document vault": "دستاویزات والٹ", "Vault": "والٹ", "All files · letters": "تمام فائلیں · خطوط", "Generate a document": "دستاویز تیار کریں",
  "Authority letter, summary, checklist…": "اتھارٹی لیٹر، خلاصہ، چیک لسٹ…", "Notifications": "اطلاعات", "Mark all read": "سب پڑھ لیے",
  "You're all caught up": "کوئی نئی اطلاع نہیں", "new": "نئی", "My profile": "میری پروفائل", "Visit website": "ویب سائٹ دیکھیں",
  "Sign in as someone else": "کسی اور اکاؤنٹ سے سائن اِن کریں", "Client": "کلائنٹ", "Search": "تلاش", "Search…": "تلاش کریں…",
  "Search pages, returns, documents…": "صفحات، ریٹرنز، دستاویزات تلاش کریں…", "Pages": "صفحات", "Searching…": "تلاش جاری ہے…",
  "No results for": "کوئی نتیجہ نہیں", "to move": "منتقل کریں", "to open": "کھولیں", "Tip: press / anywhere": "اشارہ: کہیں بھی / دبائیں",
  "Message consultant": "کنسلٹنٹ کو پیغام", "WhatsApp us": "واٹس ایپ کریں", "Chat now": "ابھی بات کریں",
  // payments
  "How to pay": "ادائیگی کا طریقہ",
  "I have paid": "میں نے ادائیگی کر دی",
  "Amount": "رقم",
  "Transaction reference": "ٹرانزیکشن ریفرنس",
  "Paid": "ادا شدہ",
  "Unpaid": "غیر ادا شدہ",
  "Payment proof": "ادائیگی کا ثبوت",
};

const saved = (() => {
  try {
    return localStorage.getItem("ptc-lang");
  } catch {
    return null;
  }
})();

i18n.use(initReactI18next).init({
  resources: { en: { translation: {} }, ur: { translation: ur } },
  lng: saved === "ur" ? "ur" : "en",
  fallbackLng: "en",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

export function applyDirection(lang: string) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  document.documentElement.classList.toggle("font-urdu", lang === "ur");
}

export function setLanguage(lang: "en" | "ur") {
  void i18n.changeLanguage(lang);
  applyDirection(lang);
  try {
    localStorage.setItem("ptc-lang", lang);
  } catch {
    /* not remembered */
  }
}

applyDirection(i18n.language);

export default i18n;
