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
    ties:       ['#e0b23a', '#c0392b', '#2980b9', '#27ae60', '#ff6fa5'],
  };

  const DEFAULT_AVATAR = {
    name: '', skin: '#f6c9a0', hairColor: '#3c2a20', hair: 'short',
    suit: '#22314a', tie: '#e0b23a', shades: true,
  };

  return {
    CHARACTERS, GRAMMAR_PACKS, RANKS, AVATAR_OPTIONS, DEFAULT_AVATAR,
    pro, Pro,
    POINTS_PER_CLIP: 25,
    MISSION_BONUS: 20,
  };
})();
