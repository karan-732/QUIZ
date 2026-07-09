-- Replace placeholder seed questions with the real question bank
-- sourced from kahoot_questions2.pdf.
delete from questions;

insert into questions
  (question_text, option_a, option_b, option_c, option_d, correct_option, time_limit_seconds, display_order)
values
  (
    'An AI Intern keeps giving wrong answers about return policy exceptions. What''s most likely missing?',
    'It needs a better system prompt with a friendlier tone',
    'It needs to be single-purpose instead of multi-purpose',
    'Its knowledge base doesn''t actually contain the exceptions document — it''s guessing',
    'It needs to be moved from Chat to Co-work',
    'C', 20, 1
  ),
  (
    'You''re building an AI assistant for your HR team that will screen resumes using the same rubric every day. Where should you build it?',
    'A normal chat, because Claude remembers your last few messages anyway.',
    'A Project, because it needs persistent instructions, knowledge files, and repeated use.',
    'Start a new chat every morning and paste the SOP manually.',
    'One shared chat link that everyone continues using forever.',
    'B', 20, 2
  ),
  (
    'You want to use Claude to build a highly disruptive 5-year growth strategy for your specific business. You have 15 minutes. What is statistically the most effective thing to get a hyper-customized, elite output?',
    'Paste a 50-page generic industry report and ask it to adapt it to your company.',
    'Write a 3-page detailed backstory of your company''s history and ask for a plan.',
    'Use CRAFT prompt detailing your role, goals, and target format.',
    '"Act as an elite McKinsey partner. Interview me one question at a time to extract the context in my head, then build the strategy."',
    'D', 20, 3
  ),
  (
    'You accidentally paste a sensitive, unredacted vendor agreement into a free Claude or ChatGPT window to summarize it. Realizing your mistake, you immediately click "Delete Chat" 10 seconds later. What actually happens to that company data?',
    'It is instantly wiped from the AI company''s backend servers permanently.',
    'It is encrypted and locked, readable only if a government agency requests it.',
    'It remains stored in their backend logs for up to 30 days and can be used to train future models unless you explicitly toggled off data sharing in your settings first.',
    'The AI system automatically flags it as a contract and self-destructs the data block.',
    'C', 20, 4
  ),
  (
    'In the opening case studies, Interos used AI to map supply chain risks "five layers deep," predicting an upstream factory shutdown days before the primary supplier even reported it. How did the AI actually figure this out without any direct access to those sub-vendors?',
    'It analyzed the primary supplier''s historical shipping data to spot seasonal patterns in past delivery delays.',
    'It required all sub-suppliers to fill out automated risk-compliance forms to update their operational status.',
    'It continuously scanned millions of messy public data points—like local foreign news, weather alerts, and customs filings—to connect the dots between hidden vendors.',
    'It integrated directly into the supplier''s internal inventory software to monitor raw material levels in real-time.',
    'C', 20, 5
  );
