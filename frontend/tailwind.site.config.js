// Website (www/Jinja) stylesheet: same theme tokens as the portal, but only the classes the website templates use.
import base from "./tailwind.config.js";

export default {
  ...base,
  content: ["../pakistan_tax_consultancy/www/**/*.{html,py}", "../pakistan_tax_consultancy/templates/**/*.html"],
};
