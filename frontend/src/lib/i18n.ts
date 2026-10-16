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
