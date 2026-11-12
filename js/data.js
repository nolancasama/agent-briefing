/* ============================================================
   AGENT BRIEFING — mission data
   Teachers: add characters or grammar packs here.
   The rest of the game adapts automatically.
   ============================================================ */
'use strict';

const DATA = (() => {

  const pro = c => (c.gender === 'f' ? 'she' : 'he');
  const Pro = c => (c.gender === 'f' ? 'She' : 'He');

  /* ---------- Persons of Interest ---------- */
  const CHARACTERS = [
    {
      id: 'ben', name: 'Ben', gender: 'm', codename: 'FOX CUB', fileNo: '001',
      look: { skin: '#f6c9a0', hairColor: '#5b3a1e', hair: 'short', shirt: '#e74c3c' },
      facts: {
        personality: { value: 'kind',        icon: '💛' },
        likes:       { value: 'soccer',      icon: '⚽' },
        can:         { value: 'swim',        icon: '🏊' },
        has:         { value: 'a dog',       icon: '🐶' },
        wants:       { value: 'a new ball',  icon: '🎁' },
        dislikes:    { value: 'carrots',     icon: '🥕' },
      },
    },
    {
      id: 'mia', name: 'Mia', gender: 'f', codename: 'PINK PANDA', fileNo: '002',
      look: { skin: '#ffd9b3', hairColor: '#3c2a20', hair: 'bob', shirt: '#ff6fa5' },
      facts: {
        personality: { value: 'funny',       icon: '😄' },
        likes:       { value: 'drawing',     icon: '🎨' },
        can:         { value: 'sing',        icon: '🎤' },
        has:         { value: 'a cat',       icon: '🐱' },
        wants:       { value: 'a red bike',  icon: '🚲' },
        dislikes:    { value: 'rain',        icon: '🌧️' },
      },
    },
    {
      id: 'leo', name: 'Leo', gender: 'm', codename: 'TURBO TIGER', fileNo: '003',
      look: { skin: '#eab676', hairColor: '#17202a', hair: 'spiky', shirt: '#f39c12' },
      facts: {
        personality: { value: 'brave',        icon: '🦁' },
        likes:       { value: 'robots',       icon: '🤖' },
        can:         { value: 'run fast',     icon: '🏃' },
        has:         { value: 'a skateboard', icon: '🛹' },
        wants:       { value: 'a puppy',      icon: '🐕' },
        dislikes:    { value: 'spiders',      icon: '🕷️' },
      },
    },
    {
      id: 'emma', name: 'Emma', gender: 'f', codename: 'SMART OWL', fileNo: '004',
      look: { skin: '#ffe0c4', hairColor: '#d9a441', hair: 'long', shirt: '#9b59b6', glasses: true },
      facts: {
        personality: { value: 'smart',       icon: '🧠' },
        likes:       { value: 'books',       icon: '📚' },
        can:         { value: 'dance',       icon: '💃' },
        has:         { value: 'a rabbit',    icon: '🐰' },
        wants:       { value: 'a telescope', icon: '🔭' },
        dislikes:    { value: 'tomatoes',    icon: '🍅' },
      },
    },
    {
      id: 'sam', name: 'Sam', gender: 'm', codename: 'JET SHARK', fileNo: '005',
      look: { skin: '#b07b4f', hairColor: '#141414', hair: 'curly', shirt: '#16a085' },
      facts: {
        personality: { value: 'friendly',        icon: '🤝' },
        likes:       { value: 'music',           icon: '🎵' },
        can:         { value: 'play the piano',  icon: '🎹' },
        has:         { value: 'a bird',          icon: '🐦' },
        wants:       { value: 'a big drum',      icon: '🥁' },
        dislikes:    { value: 'homework',        icon: '📝' },
      },
    },
    {
      id: 'lily', name: 'Lily', gender: 'f', codename: 'SUNNY BEE', fileNo: '006',
      look: { skin: '#f2c197', hairColor: '#241a12', hair: 'long', shirt: '#f4c518' },
      facts: {
        personality: { value: 'happy',        icon: '🌞' },
        likes:       { value: 'flowers',      icon: '🌸' },
        can:         { value: 'ride a bike',  icon: '🚴' },
        has:         { value: 'a hamster',    icon: '🐹' },
        wants:       { value: 'a camera',     icon: '📷' },
        dislikes:    { value: 'snakes',       icon: '🐍' },
      },
    },
  ];

  /* ---------- Grammar packs (one mission = one pack) ----------
     Every step: fact card shown to the student + sentence frame to speak. */
  const GRAMMAR_PACKS = [
    {
      id: 'L1', label: 'LEVEL 1', title: 'FIRST REPORT',
      steps: [
        {
          factLabel: 'NAME',
          icon: () => '📛',
          fact: c => c.name,
          radio: c => 'Agent, who is this person?',
          prompt: () => 'This is ______.',
          answer: c => `This is ${c.name}.`,
        },
        {
          factLabel: 'PERSONALITY',
          icon: c => c.facts.personality.icon,
          fact: c => c.facts.personality.value,
          radio: c => `What is ${c.name} like?`,
          prompt: c => `${Pro(c)} is ______.`,
          answer: c => `${Pro(c)} is ${c.facts.personality.value}.`,
        },
        {
          factLabel: 'LIKES',
          icon: c => c.facts.likes.icon,
          fact: c => c.facts.likes.value,
          radio: c => `What does ${pro(c)} like?`,
          prompt: c => `${Pro(c)} likes ______.`,
          answer: c => `${Pro(c)} likes ${c.facts.likes.value}.`,
        },
        {
          factLabel: 'CAN',
          icon: c => c.facts.can.icon,
          fact: c => c.facts.can.value,
          radio: c => `What can ${pro(c)} do?`,
          prompt: c => `${Pro(c)} can ______.`,
          answer: c => `${Pro(c)} can ${c.facts.can.value}.`,
        },
      ],
    },
    {
      id: 'L2', label: 'LEVEL 2', title: 'DEEP COVER',
      steps: [
        {
          factLabel: 'NAME',
          icon: () => '📛',
          fact: c => c.name,
          radio: c => 'Agent, who is this person?',
          prompt: () => 'This is ______.',
          answer: c => `This is ${c.name}.`,
        },
        {
          factLabel: 'HAS',
          icon: c => c.facts.has.icon,
          fact: c => c.facts.has.value,
          radio: c => `What does ${pro(c)} have?`,
          prompt: c => `${Pro(c)} has ______.`,
          answer: c => `${Pro(c)} has ${c.facts.has.value}.`,
        },
        {
          factLabel: 'WANTS',
          icon: c => c.facts.wants.icon,
          fact: c => c.facts.wants.value,
          radio: c => `What does ${pro(c)} want?`,
          prompt: c => `${Pro(c)} wants ______.`,
          answer: c => `${Pro(c)} wants ${c.facts.wants.value}.`,
        },
        {
          factLabel: "DOESN'T LIKE",
          icon: c => c.facts.dislikes.icon,
          fact: c => c.facts.dislikes.value,
          radio: c => `What doesn't ${pro(c)} like?`,
          prompt: c => `${Pro(c)} doesn't like ______.`,
          answer: c => `${Pro(c)} doesn't like ${c.facts.dislikes.value}.`,
        },
      ],
    },
  ];

  /* ---------- Agent ranks ---------- */
  const RANKS = [
    { min: 0,   name: 'ROOKIE',       icon: '🔰' },
    { min: 100, name: 'JUNIOR AGENT', icon: '⭐' },
    { min: 250, name: 'FIELD AGENT',  icon: '🌟' },
    { min: 500, name: 'SENIOR AGENT', icon: '🎖️' },
    { min: 900, name: 'MASTER SPY',   icon: '👑' },
  ];

  /* ---------- Avatar customization ---------- */
  const AVATAR_OPTIONS = {
    skins:      ['#f6c9a0', '#ffe0c4', '#eab676', '#b07b4f', '#8a5a33'],
    hairColors: ['#3c2a20', '#5b3a1e', '#141414', '#d9a441', '#a33b2e', '#5d6d7e'],
    hairs:      ['short', 'spiky', 'bob', 'long', 'curly'],
    suits:      ['#22314a', '#20232a', '#5b2d5e', '#7b1f2b', '#1d5c4a'],
    outfits:    ['suit', 'coat', 'skirt'],
    ties:       ['#e0b23a', '#c0392b', '#2980b9', '#27ae60', '#ff6fa5'],
  };

  const DEFAULT_AVATAR = {
    name: '', gender: 'm', outfit: 'suit', skin: '#f6c9a0', hairColor: '#3c2a20', hair: 'short',
    suit: '#22314a', tie: '#e0b23a', shades: true,
  };

  /* Visual facts are shared by the solution-first minigame generators. */
  const FACT_VISUALS = {};
  CHARACTERS.forEach(c => Object.values(c.facts).forEach(f => {
    FACT_VISUALS[f.value] = { emoji: f.icon, carry: false };
  }));
  const places = [
    ['soccer', '⚽', true, '🥅', 'SOCCER FIELD'],
    ['drawing', '🎨', true, '🖼️', 'ART MUSEUM'],
    ['robots', '🤖', true, '🔧', 'ROBOT SHOP'],
    ['books', '📚', true, '📖', 'LIBRARY'],
    ['music', '🎧', true, '🎵', 'MUSIC SHOP'],
    ['flowers', '🌸', true, '🌷', 'FLOWER SHOP'],
    ['swim', '🏊', false, '🏊', 'POOL'],
    ['sing', '🎤', true, '🎤', 'KARAOKE'],
    ['run fast', '🏃', false, '🏟️', 'STADIUM'],
    ['dance', '💃', false, '🪩', 'DANCE STUDIO'],
    ['play the piano', '🎹', false, '🎹', 'PIANO SCHOOL'],
    ['ride a bike', '🚲', true, '🚲', 'BIKE PATH'],
  ];
  places.forEach(([value, emoji, carry, placeEmoji, word]) => {
    FACT_VISUALS[value] = { emoji, carry, place: { emoji: placeEmoji, word } };
  });
  CHARACTERS.forEach(c => { FACT_VISUALS[c.facts.has.value].carry = true; });

  const INTEL_VOCAB = {
    1: ['cat', 'dog', 'sun', 'hat', 'pen', 'book', 'fish', 'ball', 'bird', 'happy'],
    2: ['apple', 'school', 'friend', 'garden', 'rabbit', 'yellow', 'window', 'flower'],
    3: ['elephant', 'butterfly', 'playground', 'classroom', 'red shirt', 'blue sky', 'good friend', 'school bus'],
  };
  // General → specific. Final clues distinguish even DOG/PUPPY and BIKE/SKATEBOARD.
  const PASSWORD_BANK = [
    ['DOG', 'a dog', 'It is an animal.', 'It likes walks.', 'It is a grown animal that says woof.'],
    ['CAT', 'a cat', 'It is an animal.', 'It has soft fur.', 'It says meow.'],
    ['SKATEBOARD', 'a skateboard', 'It can move.', 'You stand on it.', 'It is a board with four small wheels.'],
    ['RABBIT', 'a rabbit', 'It is an animal.', 'It can hop.', 'It has long ears and a short fluffy tail.'],
    ['BIRD', 'a bird', 'It is an animal.', 'It can fly.', 'It has feathers and a beak.'],
    ['HAMSTER', 'a hamster', 'It is a small animal.', 'It lives in a little home.', 'It keeps food in its cheeks and runs in a wheel.'],
    ['SOCCER', 'soccer', 'It is a game.', 'You play on a field.', 'You kick a ball into a goal with your feet.'],
    ['DRAWING', 'drawing', 'It is something you do.', 'You use paper.', 'You make a picture with a pencil.'],
    ['ROBOTS', 'robots', 'They are things we make.', 'They can move.', 'They are machines that can do jobs like people.'],
    ['BOOKS', 'books', 'They are things at school.', 'They have pages.', 'You read their pages to enjoy stories.'],
    ['MUSIC', 'music', 'You can enjoy it.', 'You listen to it.', 'It is the sound of songs and instruments.'],
    ['FLOWERS', 'flowers', 'They grow.', 'They have many colors.', 'They are the pretty parts of plants with petals.'],
    ['BALL', 'a new ball', 'It is a toy.', 'It can roll.', 'It is round and you can bounce it.'],
    ['BIKE', 'a red bike', 'You can ride it.', 'It has two wheels.', 'You push its pedals with your feet.'],
    ['PUPPY', 'a puppy', 'It is an animal.', 'It has soft fur.', 'It is a baby dog.'],
    ['TELESCOPE', 'a telescope', 'It is a tool.', 'You look through it.', 'It helps you see stars far away.'],
    ['DRUM', 'a big drum', 'It makes a sound.', 'It is an instrument.', 'You hit its round top with sticks.'],
    ['CAMERA', 'a camera', 'It is a tool.', 'It has a lens.', 'You press its button to take a photo.'],
    ['CARROTS', 'carrots', 'They are food.', 'They grow in the ground.', 'They are long orange vegetables.'],
    ['RAIN', 'rain', 'It is weather.', 'You may need an umbrella.', 'It is water falling from clouds.'],
    ['SPIDERS', 'spiders', 'They are small animals.', 'They make webs.', 'They have eight legs.'],
    ['TOMATOES', 'tomatoes', 'They are food.', 'They grow on plants.', 'They are red and round and make ketchup.'],
    ['HOMEWORK', 'homework', 'It is work.', 'Your teacher gives it to you.', 'It is school work you do at home.'],
    ['SNAKES', 'snakes', 'They are animals.', 'They can be long.', 'They have no legs and slide on the ground.'],
    ['APPLE', 'an apple', 'It is food.', 'It grows on a tree.', 'It is a red or green fruit with a core.'],
    ['BANANA', 'a banana', 'It is food.', 'It is a fruit.', 'It is long and yellow and you peel it.'],
    ['FISH', 'a fish', 'It is an animal.', 'It lives in water.', 'It swims with fins and breathes with gills.'],
    ['SUN', 'the sun', 'It is in the sky.', 'It gives us light.', 'It is the star that warms our world.'],
    ['MOON', 'the moon', 'It is in the sky.', 'We see it at night.', 'It goes around Earth and can look like a crescent.'],
    ['HAT', 'a hat', 'You wear it.', 'It can keep you cool.', 'You wear it on top of your head.'],
    ['SHOES', 'shoes', 'You wear them.', 'They help you walk.', 'You wear them on your feet over socks.'],
    ['PENCIL', 'a pencil', 'It is for school.', 'You hold it in your hand.', 'You write with it and can erase its gray lines.'],
    ['CHAIR', 'a chair', 'It is in a room.', 'It has legs.', 'It is a seat for one person with a back.'],
    ['CLOCK', 'a clock', 'It is a useful thing.', 'It has numbers.', 'It tells you the time.'],
    ['BUS', 'a bus', 'It can move.', 'It goes on a road.', 'It is a large vehicle that carries many people at stops.'],
    ['TREE', 'a tree', 'It grows.', 'It has leaves.', 'It is a tall plant with a wooden trunk.'],
  ].map(([answer, factValue, ...clues]) => ({ answer, factValue, clues }));

  return {
    CHARACTERS, GRAMMAR_PACKS, RANKS, AVATAR_OPTIONS, DEFAULT_AVATAR,
    FACT_VISUALS, INTEL_VOCAB, PASSWORD_BANK,
    pro, Pro,
    POINTS_PER_CLIP: 25,
    MISSION_BONUS: 20,
    INTERCEPT_BONUS: 30,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
