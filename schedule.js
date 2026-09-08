/* John Deere Z930M / Z930M EFI intervals from Deere replacement-parts
   guides and the Z900 operator-manual service section.
   Not a John Deere product. Confirm against the book on the machine. */

window.DEERE_SCHEDULE = {
  sources: [
    {
      title: "Z930M parts guide (54/60/72)",
      url: "https://www.deere.com/assets/pdfs/common/qrg/z930m-ztrak-with-54,-60,-72-inch-deck.pdf",
    },
    {
      title: "Z930M EFI 60 in. parts guide",
      url: "https://www.deere.com/assets/pdfs/common/qrg/z930m-efi-ztrak-with-60-inch-deck.pdf",
    },
    {
      title: "Z930M product page (hour meter, console label)",
      url: "https://www.deere.com/en/mowers/commercial-mowers/commercial-zero-turn/z900-series/z930m-mower/",
    },
  ],

  daily: [
    { id: "daily-oil", label: "Check engine oil" },
    { id: "daily-hydro", label: "Check hydraulic oil" },
    { id: "daily-leaks", label: "Check for leaks" },
  ],

  templates: [
    {
      id: "oil",
      title: "Engine oil + filter",
      intervalHours: 100,
      yearly: true,
      category: "engine",
      parts: {
        "non-efi": "Turf-Gard 10W-30 TY22029 (2.4 qt) · filter AM107423",
        efi: "Turf-Gard 10W-30 TY22029 (2.5 qt) · filter AM125424",
      },
      note: "Deere QRG: change every 100 hrs. Also do at least once per year.",
    },
    {
      id: "spindles",
      title: "Lubricate deck spindles",
      intervalHours: 50,
      yearly: false,
      category: "deck",
      parts: {
        "non-efi": "Multi-purpose HD lithium grease TY24416 (or TY6341)",
        efi: "Multi-purpose SD polyurea grease TY6341",
      },
      note: "Operator manual: every 50 hours.",
    },
    {
      id: "belts-cooling-battery",
      title: "Belts, cooling fins, battery",
      intervalHours: 100,
      yearly: false,
      category: "engine",
      parts: { "non-efi": "", efi: "" },
      note: "Check drive belt tension, inspect deck belt, clean cooling fins / oil cooler, clean and check battery.",
    },
    {
      id: "primary-air",
      title: "Primary air filter M131802",
      intervalHours: 300,
      yearly: false,
      category: "engine",
      parts: { "non-efi": "M131802", efi: "M131802" },
      note: "Deere QRG: every 300 hrs.",
    },
    {
      id: "fuel-filter",
      title: "Fuel filter",
      intervalHoursByVariant: { "non-efi": 500, efi: 300 },
      yearly: false,
      category: "engine",
      parts: {
        "non-efi": "AM116304 or UC21217 (match fuel system)",
        efi: "UC16183",
      },
      note: "Non-EFI QRG 500 hrs · EFI QRG 300 hrs.",
    },
    {
      id: "valve",
      title: "Check / adjust valve clearance",
      intervalHours: 300,
      yearly: false,
      category: "engine",
      parts: { "non-efi": "", efi: "" },
      note: "Operator manual: every 300 hours where specified.",
    },
    {
      id: "hydro",
      title: "Transmission / hydraulic oil + filter",
      intervalHours: 500,
      firstAtHours: 300,
      yearly: false,
      category: "drivetrain",
      parts: {
        "non-efi": "Filter kit MIA881446",
        efi: "Filter kit MIA881446 · after 300 hr break-in, then every 500 hrs",
      },
      note: "Deere: 300 hour initial break-in, then every 500 hours.",
    },
    {
      id: "secondary-air",
      title: "Secondary air filter M131803",
      intervalHours: 500,
      yearly: false,
      category: "engine",
      parts: { "non-efi": "M131803", efi: "M131803" },
      note: "Deere QRG: every 500 hrs.",
    },
    {
      id: "shroud-rops-casters",
      title: "Cooling shroud, ROPS torque, caster pivots",
      intervalHours: 500,
      yearly: false,
      category: "machine",
      parts: { "non-efi": "Grease caster pivots", efi: "Grease caster pivots" },
      note: "Remove cooling shroud and debris, check ROPS hardware torque, lubricate front caster pivots.",
    },
    {
      id: "spark",
      title: "Spark plugs",
      intervalHours: 1000,
      yearly: false,
      category: "engine",
      parts: { "non-efi": "M805853", efi: "MIU11020" },
      note: "Deere QRG: every 1000 hrs.",
    },
    {
      id: "caster-wheel",
      title: "Caster wheel",
      intervalHours: 1000,
      yearly: false,
      variants: ["non-efi"],
      category: "deck",
      parts: { "non-efi": "TCA19309", efi: "TCA19309" },
      note: "Non-EFI QRG: every 1000 hrs.",
    },
  ],
};
