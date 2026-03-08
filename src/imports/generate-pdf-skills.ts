Update the skills section layout in the buildPDF function 
in the generate-pdf endpoint. Do NOT change anything else.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE — Skills rendered in 3-column grid with bullet points
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the SKILLS section in buildPDF and replace the single 
comma-separated drawText call with a 3-column grid layout:

  if (cv.skills?.length) {
    drawSectionHeading('Skills');

    const COLS = 3;
    const COL_W = CONTENT_W / COLS;
    const BULLET = '•';
    const FONT_SIZE = 9.5;
    const LINE_H = 14;
    const BULLET_INDENT = 8;
    const TEXT_INDENT = 16; // space after bullet

    // Split skills into columns — fill column by column
    const skills = cv.skills as string[];
    const rowCount = Math.ceil(skills.length / COLS);

    // Check we have enough space for at least one row
    checkPageBreak(rowCount * LINE_H + 8);

    // Draw each row
    for (let row = 0; row < rowCount; row++) {
      checkPageBreak(LINE_H);

      for (let col = 0; col < COLS; col++) {
        const index = row + col * rowCount; // column-first order
        if (index >= skills.length) continue;

        const skill = skills[index];
        const colX = MARGIN_LEFT + col * COL_W;

        // Draw bullet
        page.drawText(BULLET, {
          x: colX + BULLET_INDENT,
          y: y - FONT_SIZE,
          font: regularFont,
          size: FONT_SIZE,
          color: DARK_GREY,
        });

        // Draw skill text — truncate if too long for column
        const maxSkillWidth = COL_W - TEXT_INDENT - BULLET_INDENT - 4;
        let skillText = skill;
        while (
          skillText.length > 0 &&
          regularFont.widthOfTextAtSize(skillText, FONT_SIZE) > maxSkillWidth
        ) {
          skillText = skillText.slice(0, -1);
        }
        if (skillText.length < skill.length) skillText += '…';

        page.drawText(skillText, {
          x: colX + TEXT_INDENT,
          y: y - FONT_SIZE,
          font: regularFont,
          size: FONT_SIZE,
          color: DARK_GREY,
        });
      }

      y -= LINE_H;
    }

    y -= 6; // spacing after skills section
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPECTED OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Skills section should look like:

  • Project coordination      • Microsoft Project        • AutoCAD
  • Client-facing comms       • Cost management          • Revit
  • Technical drawing         • Risk management          • Stakeholder mgmt

Clean 3-column grid, bullet per skill, no commas.
If skills count is not divisible by 3, last column 
may have fewer items — that is fine.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Only change the skills rendering inside buildPDF
- Do not change any other section layouts
- Do not change the screen preview — this is PDF only
- Do not change any other files or screens