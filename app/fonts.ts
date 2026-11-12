import {
  Alegreya, Alegreya_SC, Bangers, Bebas_Neue, Chakra_Petch, Comic_Neue, Cormorant_Garamond,
  Noto_Sans_JP, Nunito, Press_Start_2P, Rampart_One, Space_Grotesk, Space_Mono, VT323,
} from "next/font/google";

// Every theme's typefaces, self-hosted by next/font and exposed as CSS variables on <html>.
// The theme files (app/_themes/*.css) map them onto --font-display / --font-body / --font-mono.
// Only Terminal's fonts are preloaded; the others are fetched when a theme (or a preview of it)
// first uses them.

/* Terminal (default) */
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const notoJp = Noto_Sans_JP({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-noto-jp" });
const spaceMono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-space-mono" });

/* Rustic */
const cormorant = Cormorant_Garamond({ weight: ["500", "600", "700"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-cormorant", preload: false });
const alegreya = Alegreya({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-alegreya", preload: false });
const alegreyaSc = Alegreya_SC({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-alegreya-sc", preload: false });

/* Retro */
const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start", preload: false });
const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323", preload: false });
const chakra = Chakra_Petch({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-chakra", preload: false });

/* Minimal */
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", preload: false });

/* Comic Strip (Bebas Neue is shared with Terminal) */
const rampart = Rampart_One({ weight: "400", subsets: ["latin"], variable: "--font-rampart", preload: false });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", preload: false });

/* Manga Panel */
const bangers = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-bangers", preload: false });
const comicNeue = Comic_Neue({ weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-comic-neue", preload: false });

export const fontVariables = [
  bebas, notoJp, spaceMono, cormorant, alegreya, alegreyaSc, pressStart, vt323, chakra,
  spaceGrotesk, rampart, nunito, bangers, comicNeue,
].map((f) => f.variable).join(" ");
