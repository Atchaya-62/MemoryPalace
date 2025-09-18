/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type } from '@google/genai';

// --- Interfaces ---
interface Character {
    fact: string;
    characterName: string;
    imagePrompt: string;
    imageUrl?: string;
}

// --- DOM Elements ---
const mainContainer = document.querySelector('.container') as HTMLDivElement;
const factsInput = document.getElementById('facts-input') as HTMLTextAreaElement;
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const buttonText = generateButton.querySelector('.button-text') as HTMLSpanElement;
const spinner = generateButton.querySelector('.spinner') as HTMLDivElement;
const storyOutput = document.getElementById('story-output') as HTMLDivElement;
const galleryTitle = document.getElementById('gallery-title') as HTMLHeadingElement;
const characterGallery = document.getElementById('character-gallery') as HTMLDivElement;
const coinDisplay = document.getElementById('coin-display') as HTMLDivElement;
const coinCountSpan = document.getElementById('coin-count') as HTMLSpanElement;
const startReviewButton = document.getElementById('start-review-button') as HTMLButtonElement;

// Quiz Elements
const quizContainer = document.getElementById('quiz-container') as HTMLDivElement;
const quizProgress = document.getElementById('quiz-progress') as HTMLParagraphElement;
const quizCharacterImage = document.getElementById('quiz-character-image') as HTMLImageElement;
const quizQuestionText = document.getElementById('quiz-question-text') as HTMLHeadingElement;
const quizAnswers = document.getElementById('quiz-answers') as HTMLDivElement;

// Summary Elements
const quizSummary = document.getElementById('quiz-summary') as HTMLDivElement;
const summaryScore = document.getElementById('summary-score') as HTMLParagraphElement;
const summaryCoins = document.getElementById('summary-coins') as HTMLParagraphElement;
const resetButton = document.getElementById('reset-button') as HTMLButtonElement;


// --- State ---
let isLoading = false;
let coins = 0;
const COINS_PER_STORY = 10;
const COINS_PER_CORRECT_ANSWER = 5;

let currentDeck: Character[] = [];
let currentQuestionIndex = 0;
let score = 0;
let coinsEarnedThisSession = 0;


// --- Gemini AI Setup ---
// API Key is automatically sourced from the environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Gamification Logic ---

/**
 * Loads game data (coins) from localStorage.
 */
function loadGameData() {
    const savedCoins = localStorage.getItem('memoryPalaceCoins');
    coins = savedCoins ? parseInt(savedCoins, 10) : 0;
    updateCoinDisplay();
}

/**
 * Saves game data (coins) to localStorage.
 */
function saveGameData() {
    localStorage.setItem('memoryPalaceCoins', coins.toString());
}

/**
 * Updates the coin count in the UI.
 */
function updateCoinDisplay() {
    coinCountSpan.textContent = coins.toString();
}

/**
 * Awards coins to the user and provides visual feedback.
 * @param amount - The number of coins to award.
 */
function awardCoins(amount: number) {
    coins += amount;
    coinsEarnedThisSession += amount;
    saveGameData();
    updateCoinDisplay();
    
    // Visual feedback animation
    coinDisplay.classList.add('awarded');
    setTimeout(() => {
        coinDisplay.classList.remove('awarded');
    }, 600); // Must match animation duration in CSS
}


// --- Core App Logic ---

/**
 * Sets the loading state of the UI.
 * @param loading - Whether the app is in a loading state.
 * @param message - The message to display on the button.
 */
function setLoading(loading: boolean, message: string = 'Weave a Story') {
    isLoading = loading;
    generateButton.disabled = loading;
    spinner.hidden = !loading;
    buttonText.textContent = message;
}

/**
 * Clears the output areas and resets them to their initial state.
 */
function resetOutput() {
    storyOutput.innerHTML = `<p class="placeholder">Your magical story will appear here...</p>`;
    characterGallery.innerHTML = '';
    galleryTitle.hidden = true;
    startReviewButton.hidden = true;
    factsInput.value = '';
}


/**
 * Generates a story and character images from the user's facts.
 */
async function generateStoryAndImages() {
    if (isLoading) return;
    
    const facts = factsInput.value.trim();
    if (!facts) {
        alert('Please enter some facts in The Study first!');
        return;
    }

    setLoading(true, 'Weaving Story...');
    storyOutput.innerHTML = ''; // Clear previous content
    characterGallery.innerHTML = '';
    galleryTitle.hidden = true;
    startReviewButton.hidden = true;
    currentDeck = []; // Reset deck for new story

    const prompt = `
You are a master storyteller for an educational app called 'Memory Palace'. 
Your task is to transform a list of facts into a short, memorable, and imaginative story.
For each fact, create a unique character to represent it.
Then, provide a simple, visual prompt to generate an image for that character.

The final output MUST be a JSON object with two keys: "story" and "characters".
- "story": A string containing the full narrative.
- "characters": An array of objects, where each object has three keys: "fact" (the original fact), "characterName" (the name you created), and "imagePrompt" (a simple prompt for an image generation model, e.g., "A friendly cartoon soldier from 1857 knocking on a palace door.").

Here are the facts:
---
${facts}
---
`;

    try {
        // Step 1: Generate the story and image prompts
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        story: { type: Type.STRING },
                        characters: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    fact: { type: Type.STRING },
                                    characterName: { type: Type.STRING },
                                    imagePrompt: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });

        const data = JSON.parse(response.text);
        storyOutput.textContent = data.story;

        if (data.characters && data.characters.length > 0) {
            galleryTitle.hidden = false;
            // Step 2: Generate images for each character
            const imagePromises = data.characters.map((char: Character, index: number) => {
                setLoading(true, `Creating ${char.characterName}...`);
                return generateImage(char, index);
            });
            await Promise.all(imagePromises);
            startReviewButton.hidden = false; // Show button after all images are loaded
        }
        
        awardCoins(COINS_PER_STORY);

    } catch (error) {
        console.error(error);
        resetOutput();
        storyOutput.textContent = 'An error occurred while creating your palace. Please check the console for details.';
    } finally {
        setLoading(false, 'Weave a Story');
    }
}

/**
 * Generates a single character image, displays it, and adds it to the current deck.
 * @param characterData - The character object with fact, name, and prompt.
 * @param index - The index of the character in the array.
 */
async function generateImage(characterData: Character, index: number) {
    // Create a placeholder card
    const card = document.createElement('div');
    card.className = 'character-card';
    card.innerHTML = `<div class="img-placeholder"><div class="spinner"></div></div><p>${characterData.fact}</p>`;
    characterGallery.appendChild(card);
    
    // Add character to deck immediately to maintain order
    currentDeck[index] = characterData;

    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `${characterData.imagePrompt}, simple cartoon style, vibrant colors, no text`,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg',
              aspectRatio: '1:1',
            },
        });
        
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
        
        // Update deck with image URL
        currentDeck[index].imageUrl = imageUrl;
        
        // Replace placeholder with the generated image
        card.innerHTML = `<img src="${imageUrl}" alt="${characterData.fact}"><p>${characterData.fact}</p>`;
    } catch(error) {
        console.error(`Failed to generate image for "${characterData.fact}"`, error);
        card.innerHTML = `<div class="img-placeholder">⚠️</div><p>${characterData.fact}</p>`;
    }
}

// --- Quiz Logic ---

/**
 * Starts the quiz, hiding the main view and showing the quiz view.
 */
function startQuiz() {
    if (currentDeck.length < 2) {
        alert("You need at least 2 characters to start a review.");
        return;
    }
    mainContainer.hidden = true;
    quizContainer.hidden = false;
    currentQuestionIndex = 0;
    score = 0;
    coinsEarnedThisSession = 0;
    displayQuestion();
}

/**
 * Displays the current question and answer options.
 */
function displayQuestion() {
    const character = currentDeck[currentQuestionIndex];
    quizProgress.textContent = `Question ${currentQuestionIndex + 1} of ${currentDeck.length}`;
    quizCharacterImage.src = character.imageUrl || '';
    quizCharacterImage.alt = `Image of ${character.characterName}`;
    quizQuestionText.textContent = `This character, ${character.characterName}, reminds you of...`;

    // Generate multiple choice options
    const options = generateMultipleChoice(character.fact);
    quizAnswers.innerHTML = '';
    options.forEach(option => {
        const button = document.createElement('button');
        button.className = 'answer-button';
        button.textContent = option;
        button.onclick = () => handleAnswer(option, character.fact);
        quizAnswers.appendChild(button);
    });
}

/**
 * Generates 3 multiple choice options (1 correct, 2 distractors).
 * @param correctAnswer - The correct fact string.
 * @returns A shuffled array of answer strings.
 */
function generateMultipleChoice(correctAnswer: string): string[] {
    const allFacts = currentDeck.map(c => c.fact);
    const distractors = allFacts.filter(fact => fact !== correctAnswer);

    // Shuffle distractors and pick two
    for (let i = distractors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
    }

    const options = [correctAnswer, ...distractors.slice(0, 2)];
    
    // Shuffle the final options
     for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }

    return options;
}

/**
 * Handles the user's answer selection, provides feedback, and moves to the next question.
 * @param selectedAnswer - The answer string chosen by the user.
 * @param correctAnswer - The correct answer string for the current question.
 */
function handleAnswer(selectedAnswer: string, correctAnswer: string) {
    const buttons = quizAnswers.querySelectorAll('.answer-button');
    buttons.forEach(button => {
        button.setAttribute('disabled', 'true');
        if (button.textContent === correctAnswer) {
            button.classList.add('correct');
        } else if (button.textContent === selectedAnswer) {
            button.classList.add('incorrect');
        }
    });

    if (selectedAnswer === correctAnswer) {
        score++;
        awardCoins(COINS_PER_CORRECT_ANSWER);
    }

    setTimeout(() => {
        currentQuestionIndex++;
        if (currentQuestionIndex < currentDeck.length) {
            displayQuestion();
        } else {
            showSummary();
        }
    }, 1500); // Wait 1.5s to show feedback
}

/**
 * Displays the final quiz summary.
 */
function showSummary() {
    quizContainer.hidden = true;
    quizSummary.hidden = false;
    summaryScore.textContent = `You scored ${score} out of ${currentDeck.length}!`;
    summaryCoins.textContent = `You earned ${coinsEarnedThisSession} 💰 for this review.`;
}

/**
 * Resets the app to the initial state for creating a new story.
 */
function resetApp() {
    quizSummary.hidden = true;
    mainContainer.hidden = false;
    resetOutput();
}


// --- Event Listeners ---
generateButton.addEventListener('click', generateStoryAndImages);
startReviewButton.addEventListener('click', startQuiz);
resetButton.addEventListener('click', resetApp);


// --- Initial Setup ---
setLoading(false);
loadGameData();
