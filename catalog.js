window.ESTATE = {
  client: "3HWA",
  title: "Built For Life",
  property: "Bonita Springs Estate",
  callsign: "MAVERICK",
  sites: [
    { id: "main-house", label: "Main House" },
    { id: "office", label: "Office" },
    { id: "barn", label: "Barn" },
    { id: "man-town", label: "Man Town" },
    { id: "pump-room", label: "Pump Room" },
    { id: "ship-cont", label: "Shipp.Cont." },
    { id: "ag-land", label: "AG Land" },
  ],
  categories: [
    { id: "equipment", label: "Equipment", meter: "hours" },
    { id: "autos", label: "Autos", meter: "miles" },
    { id: "planes", label: "Planes", meter: "hours" },
    { id: "heavy", label: "Heavy Equip", meter: "hours" },
    { id: "fence-gates", label: "Fence Gates", meter: "cycles" },
  ],
};

window.GENERIC_SCHEDULES = {
  equipment: [
    { id: "eq-lube", title: "Grease / lube points", intervalHours: 50 },
    { id: "eq-oil", title: "Engine oil + filter", intervalHours: 100, yearly: true },
    { id: "eq-air", title: "Air filter", intervalHours: 300 },
  ],
  autos: [
    { id: "auto-oil", title: "Oil + filter", intervalHours: 5000, yearly: true },
    { id: "auto-tires", title: "Tire rotate / inspect", intervalHours: 7500 },
    { id: "auto-annual", title: "Annual inspection", yearly: true },
  ],
  planes: [
    { id: "pl-50", title: "50-hour inspection", intervalHours: 50 },
    { id: "pl-100", title: "100-hour inspection", intervalHours: 100 },
    { id: "pl-annual", title: "Annual / condition inspection", yearly: true },
  ],
  heavy: [
    { id: "hv-grease", title: "Grease pins and bushings", intervalHours: 50 },
    { id: "hv-oil", title: "Engine oil + filter", intervalHours: 250, yearly: true },
    { id: "hv-hyd", title: "Hydraulic filter", intervalHours: 500 },
  ],
  "fence-gates": [
    { id: "fg-insp", title: "Gate / fence inspection", intervalDays: 30 },
    { id: "fg-lube", title: "Hinges, rollers, latches", intervalDays: 90 },
    { id: "fg-hardware", title: "Hardware / operator check", yearly: true },
  ],
};

window.DAILY_BY_CATEGORY = {
  equipment: ["Check fluids", "Check leaks", "Walkaround"],
  autos: ["Tires / lights", "Fluids", "Walkaround"],
  planes: ["Preflight", "Fuel / oil", "Control surfaces"],
  heavy: ["Walkaround", "Fluids / leaks", "Tracks or tires"],
  "fence-gates": ["Visual", "Latches / stops", "Operator / power"],
};
