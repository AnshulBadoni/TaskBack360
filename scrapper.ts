import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface ChatMessage {
  sender: 'user' | 'ai';
  message: string;
  timestamp: Date;
}

interface Character {
  name: string;
  description: string;
  imageUrl?: string;
  chatUrl: string;
}

class PerchanceScraper {
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // Set user agent to avoid detection
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async getAvailableCharacters(): Promise<Character[]> {
    if (!this.page) throw new Error('Scraper not initialized');
    
    try {
      await this.page.goto('https://perchance.org/ai-character-chat', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for character list to load
      await this.page.waitForSelector('.character-card, .character-item', { timeout: 10000 });

      const characters = await this.page.evaluate(() => {
        const characterElements = document.querySelectorAll('.character-card, .character-item, [data-character]');
        const chars: Character[] = [];
        
        characterElements.forEach(element => {
          const name = element.querySelector('.character-name, .name')?.textContent?.trim() || '';
          const description = element.querySelector('.character-desc, .description')?.textContent?.trim() || '';
          const imageUrl = element.querySelector('img')?.src || '';
          const chatUrl = element.querySelector('a')?.href || '';
          
          if (name && chatUrl) {
            chars.push({
              name,
              description,
              imageUrl,
              chatUrl
            });
          }
        });
        
        return chars;
      });

      return characters;
    } catch (error) {
      console.error('Error getting characters:', error);
      return [];
    }
  }

  async selectCharacter(characterUrl: string): Promise<boolean> {
    if (!this.page) throw new Error('Scraper not initialized');
    
    try {
      await this.page.goto(characterUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for chat interface to load
      await this.page.waitForSelector('input[type="text"], textarea, .chat-input', { timeout: 10000 });
      
      return true;
    } catch (error) {
      console.error('Error selecting character:', error);
      return false;
    }
  }

  async sendMessage(message: string): Promise<string> {
    if (!this.page) throw new Error('Scraper not initialized');
    
    try {
      // Find the input field (common selectors)
      const inputSelector = 'input[type="text"], textarea, .chat-input, #messageInput';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });
      
      // Clear and type message
      await this.page.click(inputSelector);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.type(inputSelector, message);
      
      // Find and click send button
      const sendSelector = 'button[type="submit"], .send-button, .submit-btn, button:contains("Send")';
      await this.page.click(sendSelector);
      
      // Wait for response
      await this.page.waitForFunction(
        () => {
          const messages = document.querySelectorAll('.message, .chat-message');
          return messages.length > 0;
        },
        { timeout: 30000 }
      );

      // Get the latest AI response
      const response = await this.page.evaluate(() => {
        const messages = document.querySelectorAll('.message, .chat-message');
        const lastMessage = messages[messages.length - 1];
        
        // Look for AI message indicators
        const isAIMessage = lastMessage.classList.contains('ai-message') || 
                           lastMessage.classList.contains('bot-message') ||
                           lastMessage.querySelector('.ai-indicator, .bot-indicator');
        
        if (isAIMessage) {
          return lastMessage.textContent?.trim() || '';
        }
        
        return '';
      });

      return response;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    if (!this.page) throw new Error('Scraper not initialized');
    
    try {
      const messages = await this.page.evaluate(() => {
        const messageElements = document.querySelectorAll('.message, .chat-message');
        const chatHistory: ChatMessage[] = [];
        
        messageElements.forEach(element => {
          const isUser = element.classList.contains('user-message') || 
                        element.classList.contains('human-message');
          const isAI = element.classList.contains('ai-message') || 
                      element.classList.contains('bot-message');
          
          const messageText = element.textContent?.trim() || '';
          
          if (messageText && (isUser || isAI)) {
            chatHistory.push({
              sender: isUser ? 'user' : 'ai',
              message: messageText,
              timestamp: new Date()
            });
          }
        });
        
        return chatHistory;
      });

      return messages;
    } catch (error) {
      console.error('Error getting chat history:', error);
      return [];
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Usage example
export class PerchanceAPI {
  private scraper: PerchanceScraper;
  private currentCharacter: Character | null = null;

  constructor() {
    this.scraper = new PerchanceScraper();
  }

  async init() {
    await this.scraper.initialize();
  }

  async getCharacters(): Promise<Character[]> {
    return await this.scraper.getAvailableCharacters();
  }

  async selectCharacter(characterName: string): Promise<boolean> {
    const characters = await this.getCharacters();
    const character = characters.find(c => c.name.toLowerCase().includes(characterName.toLowerCase()));
    
    if (!character) {
      throw new Error(`Character '${characterName}' not found`);
    }

    const success = await this.scraper.selectCharacter(character.chatUrl);
    if (success) {
      this.currentCharacter = character;
    }
    
    return success;
  }

  async chat(message: string): Promise<string> {
    if (!this.currentCharacter) {
      throw new Error('No character selected');
    }

    return await this.scraper.sendMessage(message);
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    return await this.scraper.getChatHistory();
  }

  async close() {
    await this.scraper.cleanup();
  }
}

// Next.js API route example
export default async function handler(req: any, res: any) {
  if (req.method === 'POST') {
    const { action, characterName, message } = req.body;
    
    const api = new PerchanceAPI();
    
    try {
      await api.init();
      
      switch (action) {
        case 'getCharacters':
          const characters = await api.getCharacters();
          res.json({ characters });
          break;
          
        case 'selectCharacter':
          await api.selectCharacter(characterName);
          res.json({ success: true });
          break;
          
        case 'chat':
          const response = await api.chat(message);
          res.json({ response });
          break;
          
        default:
          res.status(400).json({ error: 'Invalid action' });
      }
    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({ error: error.message });
    } finally {
      await api.close();
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}