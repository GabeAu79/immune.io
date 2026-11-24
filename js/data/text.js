// Every word the students read lives in this file, so it can be reworded
// without touching game logic. Written for high school / AP Biology.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});

  var T = (CTD.TEXT = {});

  T.title = 'Cell Tower Defense';
  T.tagline = 'Defend the body. Learn how your immune system really works.';

  // ------------------------------------------------------------ defenders
  T.towers = {
    macrophage: {
      name: 'Macrophage', short: 'Eats viruses',
      desc: 'Short range. Engulfs one virus at a time (phagocytosis). Collects antigen from what it eats and can slowly present it to helper T-cells.'
    },
    neutrophil: {
      name: 'Neutrophil', short: 'One big burst',
      desc: '<b>Single use, cheap.</b> Waits for enemies it recognises, charges the biggest group in range, and bursts into a sticky net that damages and slows everything nearby. Then it is gone: buy another. The net also tears open infected cells, so they burst.'
    },
    nk: {
      name: 'NK Cell', short: 'Kills infected cells',
      desc: 'Natural killer cell. Attacks infected cells only, and kills them cleanly so they release no viruses. Cannot hit free viruses.'
    },
    dc: {
      name: 'Dendritic Cell', short: 'Presents antigen',
      desc: 'No attack. Samples antigen from every virus in its large range, even stealth ones, and presents it to helper T-cells. Also extends the range of nearby cells.'
    },
    helperT: {
      name: 'Helper T-Cell', short: 'Activates B and killer T',
      desc: 'No attack. Once a dendritic cell in range shows it an antigen, it activates B cells and killer T-cells in its own range and boosts nearby macrophages. HIV targets it.'
    },
    bcell: {
      name: 'B Cell', short: 'Fires antibodies',
      desc: 'Needs an active helper T-cell in range. Fires fast, long-range antibodies at free viruses of the types it has learned. Antibodies slow and tag viruses so macrophages and neutrophils hit them twice as hard.'
    },
    killerT: {
      name: 'Killer T-Cell', short: 'One-shots infected cells',
      desc: 'Needs an active helper T-cell in range. Slow, but one hit cleanly kills an infected cell of a type it has learned. Cannot hit free viruses.'
    }
  };

  T.upgrades = {
    macrophage: {
      damage: { name: 'Bigger Appetite', desc: 'More damage per bite.' },
      range: { name: 'Long Reach', desc: 'Longer pseudopods: more range.' },
      speed: { name: 'Fast Digestion', desc: 'Eats more often.' },
      present: { name: 'Antigen Display', desc: 'Collects more antigen per kill and presents it faster and further.' }
    },
    neutrophil: {},
    nk: {
      damage: { name: 'Deadlier Granules', desc: 'More damage to infected cells.' },
      range: { name: 'Wider Patrol', desc: 'More range.' },
      speed: { name: 'Quick Kill', desc: 'Attacks more often.' }
    },
    dc: {
      range: { name: 'Longer Arms', desc: 'Bigger sampling and presenting range.' },
      present: { name: 'Fast Presenter', desc: 'Samples antigen faster and primes helper T-cells faster.' },
      buff: { name: 'Cytokine Signal', desc: 'Nearby cells get a bigger range bonus.' }
    },
    helperT: {
      range: { name: 'Wider Help', desc: 'Reaches B and killer T-cells further away.' },
      speed: { name: 'Clonal Expansion', desc: 'Gets primed faster and activates its B and killer T-cells faster.' },
      boost: { name: 'Macrophage Signal', desc: 'Nearby macrophages do even more damage.' }
    },
    bcell: {
      speed: { name: 'Antibody Factory', desc: 'Fires antibodies faster.' },
      range: { name: 'Long-Range Antibodies', desc: 'More range.' },
      damage: { name: 'Affinity Maturation', desc: 'Antibodies fit better: more damage and longer-lasting tags.' },
      plasma: { name: 'Plasma Cell', desc: 'Becomes a full-time antibody factory: nearly double the firing rate.' }
    },
    killerT: {
      speed: { name: 'Faster Hunter', desc: 'Attacks more often.' },
      range: { name: 'Wider Patrol', desc: 'More range.' },
      multi: { name: 'Serial Killer', desc: 'Hits one more infected cell per attack and hurts a syncytium more.' }
    }
  };

  T.arm = { innate: 'Innate', adaptive: 'Adaptive' };

  // ------------------------------------------------------------ clinic
  T.items = {
    vaccine: {
      name: 'Vaccine',
      desc: 'Between waves only. Pick a virus type: your helper T, B and killer T-cells will recognise it at once for the next 5 waves. Check the next-wave preview to choose well. There is no vaccine for HIV.'
    },
    serum: {
      name: 'Antibody Serum',
      desc: 'During a wave. Donated antibodies tag, slow and weaken every free virus for 10 seconds. Fast help, but your body learns nothing from it. Does not work on HIV.'
    },
    art: {
      name: 'HIV Medicine (ART)',
      desc: 'During a wave. For 20 seconds HIV cannot harm helper T-cells and HIV-infected cells stop releasing virus. It blocks HIV; it does not cure it.'
    },
    noHivVaccine: 'No HIV vaccine exists: the virus mutates too fast.'
  };

  // ------------------------------------------------------------ status lines
  T.status = {
    helperNoPresenter: 'Naive: no dendritic cell (or macrophage) close enough to show it an antigen.',
    helperWaiting: 'Naive: a presenter is in range but has not collected enough antigen yet.',
    helperPriming: 'Being primed by an antigen-presenting cell...',
    helperActive: 'Active: helping B cells and killer T-cells in range.',
    effectorNoHelper: 'Naive: no helper T-cell in range.',
    effectorWaiting: 'Naive: the helper T-cell in range has not been activated yet.',
    effectorLearning: 'Being activated by a helper T-cell...',
    effectorActive: 'Active.',
    effectorWeak: 'Trained, but no active helper T-cell in range: working at 25%.',
    presenterNone: 'No antigen collected yet.',
    presenterSome: 'Collecting antigen...',
    presenterReady: 'Presenting antigen.'
  };

  T.ui = {
    startWave: 'Start Wave',
    waveRunning: 'Wave in progress',
    nextWave: 'Next wave',
    sell: 'Sell',
    locked: 'Unlocks at wave ',
    maxed: 'MAX',
    hintPlace: 'Click the tissue to place. Right-click or Esc to cancel.',
    hintPlaceTouch: 'Tap the tissue to place. Tap the shop button again to cancel.',
    hintIdleTouch: 'Pick a cell from the shop, then tap the tissue to place it. Tap a placed cell to upgrade it.',
    singleUse: 'Single use: no upgrades. It bursts once and is gone.',
    hintIdle: 'Pick a cell from the shop, then click the tissue to place it. Click a placed cell to upgrade it.',
    fever: 'FEVER!',
    burst: 'BURST!',
    clean: 'Clean kill',
    hivMutated: 'HIV mutated! Training against it is out of date.',
    helperLost: 'Helper T-cell lost to HIV!',
    waveClear: 'Wave cleared!'
  };

  // ------------------------------------------------------------ briefing cards
  // Shown in Class mode before the wave with that number. art: ['enemy' | 'tower', type]
  T.briefings = {
    1: [
      {
        title: 'Welcome, immune system!',
        art: ['tower', 'macrophage'],
        body: 'Viruses are coming down the <b>blood vessel</b> toward the vital organs. Buy immune cells with <b>ATP</b> (energy) and place them on the tissue beside the vessel. You earn ATP for every virus you stop and at the end of each wave.'
      },
      {
        title: 'Common virus',
        art: ['enemy', 'common'],
        body: 'Its genetic material carries danger patterns called <b>PAMPs</b>. Your <b>innate</b> cells are born knowing these patterns, so they recognise it every time. Start with <b>macrophages</b>. <b>Neutrophils</b> are cheap, single-use backup for when a crowd gets through.'
      },
      {
        title: 'Fever',
        art: ['fever'],
        body: 'If viruses reach the end, <b>fever and inflammation</b> burn them off. It works, but it hurts the body too: you lose <b>Body Health</b>. Reach zero and the body is overwhelmed.'
      }
    ],
    3: [
      {
        title: 'Infected cell',
        art: ['enemy', 'cell_common'],
        body: 'A body cell that a virus has turned into a <b>virus factory</b>. It releases new viruses as it travels. If a macrophage or neutrophil destroys it, it <b>bursts</b> and spills even more.'
      },
      {
        title: 'Use the right tool',
        art: ['tower', 'nk'],
        body: '<b>NK cells</b> order an infected cell to shut itself down neatly, so <b>no viruses escape</b>. A clean kill also earns more ATP. NK cells cannot attack free viruses.'
      }
    ],
    4: [
      {
        title: 'Cloaked virus',
        art: ['enemy', 'cloaked'],
        body: 'It wears an <b>envelope</b> stolen from a human cell and a coat of sugars that looks like "self". Each innate cell has only a <b>40% chance</b> to recognise it, and the sugar shield soaks up their first hits.'
      },
      {
        title: 'Adaptive immunity unlocked',
        art: ['tower', 'helperT'],
        body: 'Build a chain: a <b>dendritic cell</b> collects antigen and shows it to a <b>helper T-cell</b> in its range. The helper then activates <b>B cells</b> (antibodies against free viruses) and <b>killer T-cells</b> (against infected cells) in <i>its</i> range. It takes time, but they never forget.'
      }
    ],
    6: [
      {
        title: 'Stealth virus',
        art: ['enemy', 'stealth'],
        body: 'It hides its PAMPs and jams the alarm, so macrophages and neutrophils <b>cannot see it at all</b>. Only trained <b>adaptive</b> cells can target it. Dendritic cells still sample it, which is how the training starts.'
      },
      {
        title: 'Vaccines',
        art: ['vaccine'],
        body: 'A <b>vaccine</b> shows your adaptive cells an antigen <i>before</i> the virus arrives, so they are ready from the first second. Buy it between waves in the Clinic. You still need the T and B cells in place.'
      }
    ],
    10: [
      {
        title: 'Syncytium',
        art: ['enemy', 'syn_common'],
        body: 'Some viruses make infected cells <b>fuse</b> into one giant. It releases viruses fast, and if it is torn open it splits into several infected cells. Killer T-cells and NK cells take it down cleanly, but it needs many hits.'
      }
    ],
    12: [
      {
        title: 'HIV',
        art: ['enemy', 'hiv'],
        body: 'HIV infects and kills <b>helper T-cells</b>. Watch the <b>CD4 bar</b> on each one. If a helper dies it becomes an HIV factory, and the B and killer T-cells it was helping drop to 25% power. HIV also <b>mutates</b>: training against it is lost after every wave, and there is no vaccine.'
      },
      {
        title: 'HIV medicine',
        art: ['art'],
        body: '<b>Antiretroviral therapy (ART)</b> is now in the Clinic. While it lasts, HIV cannot harm helper T-cells or make new copies. It does not remove the virus, so use it when your helpers are in danger.'
      }
    ],
    15: [
      {
        title: 'Final wave',
        art: ['enemy', 'syn_hiv'],
        body: 'Everything at once. Keep your helper T-cells alive, kill infected cells cleanly, and let antibodies do the tagging. Good luck!'
      }
    ]
  };

  // ------------------------------------------------------------ encyclopedia
  T.encyclopediaGroups = ['Defenders', 'Invaders', 'Big ideas'];
  T.encyclopedia = [
    {
      group: 'Defenders', title: 'Macrophage', art: ['tower', 'macrophage'],
      game: 'Engulfs one virus at a time at short range. Each kill adds antigen it can slowly present to a helper T-cell. An active helper T-cell nearby makes it stronger.',
      real: 'Macrophages ("big eaters") live in almost every tissue. They swallow microbes and dead cells by phagocytosis, break them down, and display pieces (antigens) on their surface. Signals from helper T-cells make them far more aggressive.',
      versus: 'Macrophages mostly re-alert T-cells that are already trained. Starting a brand-new adaptive response is mainly the dendritic cell\'s job, which is why the macrophage presents so slowly here.'
    },
    {
      group: 'Defenders', title: 'Neutrophil', art: ['tower', 'neutrophil'],
      game: 'Single use and cheap. It charges the biggest group of enemies it can recognise and bursts into a net that damages and slows everything in it, recognised or not. The net stays on the vessel for a few seconds. Then the neutrophil is gone and you buy another. Its net tears infected cells open. If its target disappears before it arrives, it walks home and waits again.',
      real: 'Neutrophils are the most common white blood cell. They live only hours to days, and bone marrow makes about 100 billion a day. One of their weapons is a NET: the cell throws out its own DNA as a sticky web covered in toxic proteins, and dies doing it.',
      versus: 'Single use is true to life: a neutrophil that throws a NET dies doing it, and the body simply sends more. But neutrophils are mainly bacteria and fungus fighters. They do help against viruses, but less than this game suggests. Their attacks also damage healthy tissue nearby, which the game does not charge you for.'
    },
    {
      group: 'Defenders', title: 'NK Cell', art: ['tower', 'nk'],
      game: 'Attacks infected cells only. Kills them cleanly, so no viruses are released. Needs no training.',
      real: 'Natural killer cells check body cells for signs of trouble, such as stress signals or a missing "self" ID tag (MHC class I) that many viruses try to remove. They inject proteins that make the cell destroy itself neatly (apoptosis), virus and all.',
      versus: 'Real NK cells never attack free virus particles, and neither do these. They are also helped by antibodies that flag infected cells, which is not in the game.'
    },
    {
      group: 'Defenders', title: 'Dendritic Cell', art: ['tower', 'dc'],
      game: 'Does not attack. Samples antigen from every enemy in range, including stealth viruses. When it has enough, it primes helper T-cells in range. Cells near it get extra range.',
      real: 'Dendritic cells are the messengers between innate and adaptive immunity. They constantly sample their surroundings, then carry antigens to a lymph node and show them to T-cells that have never seen that antigen before.',
      versus: 'Real dendritic cells travel to a lymph node, and that is where T and B cells are activated. In the game, "being in range" stands in for meeting in the lymph node. The range bonus represents chemical signals called cytokines.'
    },
    {
      group: 'Defenders', title: 'Helper T-Cell', art: ['tower', 'helperT'],
      game: 'Does not attack. Once primed by a presenter in range, it activates B cells and killer T-cells in its own range and boosts macrophages. Without a living helper nearby, B and killer T-cells work at 25%. HIV drains its CD4 bar.',
      real: 'Helper T-cells (CD4 T-cells) are the coordinators. Each one recognises a single antigen. When activated they multiply and release cytokines that switch on B cells, killer T-cells and macrophages.',
      versus: 'In reality killer T-cells are shown antigen by dendritic cells directly, and helper T-cells make that response strong and lasting. B cells also grab antigen themselves before asking for help. The game uses the simpler chain found in most textbooks.'
    },
    {
      group: 'Defenders', title: 'B Cell', art: ['tower', 'bcell'],
      game: 'Fires antibodies quickly over a long range at free viruses of types it has learned. Antibodies do a little damage, slow the virus, and tag it: tagged viruses take double damage from macrophages and neutrophils, lose their sugar shield, and become visible to them.',
      real: 'Each B cell makes antibodies that fit one antigen. With T-cell help it multiplies and matures into plasma cells, which release thousands of antibodies per second, and memory B cells, which wait for the same invader to return.',
      versus: 'Antibodies do not destroy viruses. They block them from entering cells (neutralisation) and flag them for phagocytes (opsonisation). They cannot get inside an infected cell, so the B cell ignores infected cells. Antibodies are really made by plasma cells, which is the name of the top upgrade.'
    },
    {
      group: 'Defenders', title: 'Killer T-Cell', art: ['tower', 'killerT'],
      game: 'Slow, but one hit cleanly kills an infected cell of a type it has learned. Ignores free viruses.',
      real: 'Killer T-cells (cytotoxic or CD8 T-cells) check the fragments that every body cell displays on its surface. If a cell shows viral fragments, the killer T-cell makes it self-destruct neatly, before it can release new viruses.',
      versus: 'One killer T-cell really can kill many infected cells in a row. The "one shot" is fair. The wait before each attack stands in for the time it takes to find the next target.'
    },
    {
      group: 'Invaders', title: 'Common virus', art: ['enemy', 'common'],
      game: 'Every innate cell recognises it. Later waves bring fast and tough versions.',
      real: 'Viruses are tiny packages of genetic material in a protein coat. They cannot copy themselves; they must get inside a cell and use its machinery. Innate cells detect them through PAMPs: molecular patterns, such as viral RNA, that human cells do not normally have.',
      versus: 'Most viral PAMPs are detected inside cells, after the virus has been swallowed or has infected a cell, not on a virus floating past. Viruses also are not alive and have no "health".'
    },
    {
      group: 'Invaders', title: 'Cloaked virus', art: ['enemy', 'cloaked'],
      game: 'Innate cells have a 40% chance to recognise each one. A sugar shield absorbs innate damage. Antibodies ignore the shield and make it visible to everyone.',
      real: 'Enveloped viruses leave a cell wrapped in a piece of its membrane. Their spike proteins are coated in human-made sugars (a glycan shield) that hide them from the immune system. But those same spikes are what antibodies learn to grab.',
      versus: 'The stolen membrane itself makes a virus weaker, not tougher: soap destroys it, which is why hand-washing works. The extra toughness here represents the sugar shield, not the membrane.'
    },
    {
      group: 'Invaders', title: 'Stealth virus', art: ['enemy', 'stealth'],
      game: 'Innate attackers cannot recognise it unless an antibody has tagged it. Dendritic cells still sample it. Trained B cells target it normally.',
      real: 'Many viruses hide their genetic material or carry proteins that switch off the cell\'s alarm system (interferon). Influenza and Ebola both do this. It buys the virus time before the immune system notices.',
      versus: 'No real virus is completely invisible to innate immunity. Stealth viruses delay and weaken the alarm rather than cancel it.'
    },
    {
      group: 'Invaders', title: 'HIV', art: ['enemy', 'hiv'],
      game: 'Drains the CD4 bar of helper T-cells within reach. A helper that reaches zero dies and becomes an HIV-infected cell. Training against HIV is lost after every wave. No vaccine. ART pauses it.',
      real: 'HIV enters helper T-cells through the CD4 protein on their surface. Over years, untreated infection destroys so many helper T-cells that the rest of the immune system stops working properly: that stage is AIDS. HIV copies itself carelessly, so it mutates faster than antibodies can keep up. Daily antiretroviral therapy stops it copying, and people on treatment can live long, healthy lives.',
      versus: 'HIV also hides inside macrophages and dendritic cells without killing them, and it acts over years, not seconds. Real ART is taken every day for life, not in short bursts.'
    },
    {
      group: 'Invaders', title: 'Infected cell', art: ['enemy', 'cell_common'],
      game: 'Slow and tough. Releases a virus every few seconds. Bursts into several viruses if destroyed by a macrophage or neutrophil, or if it reaches the end. Killed cleanly by NK cells and trained killer T-cells.',
      real: 'Once inside, a virus turns the cell into a factory that can make thousands of new viruses. Some viruses bud off steadily; others fill the cell until it breaks open. The immune system\'s answer is to make the infected cell self-destruct before it finishes.',
      versus: 'Macrophages do clear away dying infected cells in real life without setting viruses free. Infected cells also mostly stay where they are rather than travelling down a vessel.'
    },
    {
      group: 'Invaders', title: 'Syncytium', art: ['enemy', 'syn_common'],
      game: 'A giant boss. Releases viruses quickly. Splits into three infected cells unless killed cleanly. Killer T-cells need several hits.',
      real: 'Some viruses, including measles, RSV and HIV, put fusion proteins on the surface of the infected cell. It merges with its neighbours into one huge cell with many nuclei, letting the virus spread without ever going outside.',
      versus: 'A real syncytium stays in the tissue where it formed.'
    },
    {
      group: 'Big ideas', title: 'Innate vs. adaptive', art: ['tower', 'dc'],
      game: 'Innate cells work from wave 1 and need no training, but some viruses fool them. Adaptive cells need a chain and time, but can target anything they have learned.',
      real: 'Innate immunity is fast (minutes to hours) and general: it recognises broad patterns shared by many microbes. Adaptive immunity is slow the first time (days) but specific: each T or B cell recognises one antigen, and the body keeps memory cells afterwards.',
      versus: 'The two systems are not separate teams. They signal each other constantly, which the helper T-cell boost to macrophages hints at.'
    },
    {
      group: 'Big ideas', title: 'Antigens and memory', art: ['antigens'],
      game: 'Each virus family has its own coloured antigen. Coloured dots under an adaptive cell show which antigens it has learned. Learned antigens stay learned, except HIV.',
      real: 'An antigen is any molecule the adaptive immune system can recognise, such as a viral spike protein. After an infection, memory T and B cells for that antigen can last for decades and respond much faster the second time.',
      versus: 'Real memory is not always permanent, and viruses such as influenza change their antigens over time, which is why you can catch the flu again.'
    },
    {
      group: 'Big ideas', title: 'Vaccine, serum and medicine', art: ['vaccine'],
      game: 'Vaccine: before a wave, trains your cells against one virus type for 5 waves. Serum: during a wave, 10 seconds of donated antibodies. ART: pauses HIV for 20 seconds.',
      real: 'A vaccine shows the immune system a harmless antigen so it builds its own memory (active immunity). Donated or lab-made antibodies protect straight away but fade within weeks (passive immunity); babies get this from their mothers. Antiviral drugs do not involve the immune system: they block the virus directly.',
      versus: 'Real vaccine protection usually lasts years, with boosters for some diseases. In the game it wears off after 5 waves unless your cells also meet the real virus.'
    },
    {
      group: 'Big ideas', title: 'Fever and inflammation', art: ['fever'],
      game: 'Viruses that reach the end are burned off, and you lose Body Health.',
      real: 'Immune cells release cytokines that raise body temperature and bring more blood and cells to the area. This slows viruses and speeds up immune cells. Too much of it damages the body\'s own tissue; a runaway response is called a cytokine storm.',
      versus: 'Fever and inflammation are part of the innate response from the start of an infection, not a last resort at the end of the line.'
    },
    {
      group: 'Big ideas', title: 'Size and scale', art: ['enemy', 'commonTough'],
      game: 'Viruses and cells are drawn at similar sizes so you can see them.',
      real: 'A typical virus is about 100 nanometres across. A macrophage is about 20 micrometres: roughly 200 times wider. If a virus were a tennis ball, the macrophage would be a three-storey building.',
      versus: 'The road is a blood vessel, and the tissue beside it is where your cells sit. Real immune cells patrol the whole body.'
    }
  ];

  // ------------------------------------------------------------ report card
  T.report = {
    titleWin: 'Immune Report Card',
    titleLose: 'The body was overwhelmed',
    loseBody: 'Too much fever and inflammation. Look at where viruses got through, and try again.',
    ranks: [[90, 'Peak health: barely a sniffle'], [60, 'Recovered well'], [30, 'A rough few weeks in bed'], [0, 'Survived... just']],
    recap: [
      '<b>Innate</b> cells act at once and recognise general danger patterns (PAMPs).',
      '<b>Adaptive</b> cells need antigen presentation and time, but are specific and remember.',
      'The chain: <b>dendritic cell → helper T-cell → B cells and killer T-cells</b>.',
      '<b>Antibodies</b> deal with free viruses. <b>Killer T-cells and NK cells</b> deal with infected cells.',
      '<b>HIV</b> is dangerous because it destroys helper T-cells, the coordinators.',
      'A <b>vaccine</b> trains the body in advance. <b>Serum</b> is borrowed, short-lived protection.'
    ]
  };
})();
