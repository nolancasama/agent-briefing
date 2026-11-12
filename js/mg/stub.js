/* Functional stand-ins. Real game files register first and take precedence. */
(() => {
  'use strict';
  ['photo','typing','password','chase','cctv','drone'].forEach(id => {
    if (Minigames.get(id)) return;
    const kind = ['photo','typing','password'].includes(id) ? 'intel' : 'intercept';
    Minigames.register({
      id, kind, title: { photo: 'PHOTOGRAPHIC IDENTIFICATION', typing: 'INTEL TERMINAL', password: 'PASSWORD VAULT', chase: 'FIELD PURSUIT', cctv: 'SURVEILLANCE CONTROL', drone: 'DRONE SEARCH' }[id],
      brief: () => kind === 'intel' ? 'Read the HQ clues to unlock the subject file.' : 'Practice a friendly interception with your field team.',
      mount(host, ctx) {
        const panel = document.createElement('div'); panel.className = 'panel mg-stand-in';
        const title = document.createElement('h2'); title.textContent = kind === 'intel' ? 'HQ INTELLIGENCE' : 'FIELD TEAM READY'; panel.appendChild(title);
        const clues = document.createElement('div'); clues.className = 'mg-clues';
        (kind === 'intel' ? ctx.profile.packFacts.map(f => f.sentence) : ctx.profile.clues).forEach(text => {
          const line = document.createElement('p'); line.textContent = text; clues.appendChild(line);
        });
        panel.appendChild(clues);
        const actions = document.createElement('div'); actions.className = 'ops-actions'; panel.appendChild(actions);
        (kind === 'intel' ? ['CONTINUE'] : ['CAUGHT','ESCAPED']).forEach(label => {
          const button = document.createElement('button'); button.className = 'btn primary'; button.textContent = label;
          button.dataset.stub = label.toLowerCase(); actions.appendChild(button);
          ctx.kit.on(button, 'click', () => {
            if (ctx.kit.paused) return;
            ctx.done(kind === 'intel' ? { success: true, score: 100, revealed: ctx.profile.packFacts.map(f => f.key), stats: { standIn: true } } : {
              success: label === 'CAUGHT', outcome: label === 'CAUGHT' ? 'caught' : 'escaped', score: label === 'CAUGHT' ? 100 : 0, wrongPicks: 0, markHides: 0, stats: { standIn: true },
            });
          });
        });
        host.appendChild(panel);
        return { destroy() { panel.remove(); } };
      },
    });
  });
})();
