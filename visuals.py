import pygame
import os

# --- KONFIGURACE ---
WIDTH = 1920
HEIGHT = 1080
BG_COLOR = (74, 48, 24) # Hnědá barva stolu z tvého nastavení
CARD_WIDTH = 100
CARD_HEIGHT = 150 # Uprav podle potřeby

# --- INICIALIZACE ---
pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Bang! - Herní Stůl")
clock = pygame.time.Clock()

# --- NAČÍTÁNÍ OBRÁZKŮ KARET ---
# Předpokládáme, že obrázky jsou ve složce 'assets'
# Přejmenuj si své obrázky naskenovaných karet na 'card_x_y.png' nebo podobně
# Například pro zobrazení Bang karet z naskenovaného obrázku:

# Příklad načtení jedné Bang karty (musíš si obrázek vystřihnout a uložit jako 'bang_standard.png' atd.)
# Tady pro ukázku načtu jen jeden z obrázků karet, které jsi nahrál, abych ti ukázal, že to jde.
IMAGE_PATH = os.path.join('cards', 'image_0.png') # Cesta k tvému naskenovanému obrázku

try:
    # Pygame neumí načíst celý velký obrázek a sám si ho "vystřihnout", 
    # pro prototyp si musíme obrázky vystřihnout a uložit zvlášť.
    # Tady načítám jen jeden obrázek jako příklad.
    bang_surface = pygame.image.load(IMAGE_PATH) # Tady načítám celý tvůj scan pro demonstraci.
    bang_standard = pygame.transform.scale(bang_surface, (CARD_WIDTH, CARD_HEIGHT)) # Zmenšíme ho
    card_back = pygame.Surface((CARD_WIDTH, CARD_HEIGHT)) # Tady vytvoříme dočasný rub (rub_karty.png by byl lepší)
    card_back.fill((100, 100, 100)) # Šedý rub pro prototyp
except Exception as e:
    print(f"Chyba při načítání obrázků: {e}")
    # Fallback pro případ chyby načítání
    bang_standard = pygame.Surface((CARD_WIDTH, CARD_HEIGHT))
    bang_standard.fill((200, 50, 50)) # Červená pro Bang
    card_back = pygame.Surface((CARD_WIDTH, CARD_HEIGHT))
    card_back.fill((100, 100, 100)) # Šedý rub


# --- ZÁKLADNÍ HERÍ CYKLUS ---
running = True
while running:
    # --- 1. ZPRACOVÁNÍ UDÁLOSTÍ ---
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # --- 2. AKTUALIZACE STAVU KARET ---
    # Tady by byla logika, která čte ze serveru 'state' a aktualizuje
    # pozice a viditelnost karet. Pro prototyp si definujeme pevné pozice.

    # --- 3. KRESLENÍ SCÉNY ---
    screen.fill(BG_COLOR) # Vymazat obrazovku barvou stolu

    # Zóna 1: Moje hernia plocha (Dole) - Načtená Bang! karta
    # Tvůj prototyp karet kreslíme na souřadnice
    screen.blit(bang_standard, (WIDTH // 2 - CARD_WIDTH // 2, HEIGHT - CARD_HEIGHT - 20)) 
    
    # Karta Vybavení (Modrá) - Příklad
    # Pro prototyp vytvoříme modrý obdélník
    equipment_card = pygame.Surface((CARD_WIDTH, CARD_HEIGHT))
    equipment_card.fill((50, 50, 200)) # Modrá
    screen.blit(equipment_card, (WIDTH // 2 - CARD_WIDTH // 2 - CARD_WIDTH - 20, HEIGHT - CARD_HEIGHT - 20))

    # Zóna 2: Herní centrum (Střed)
    # Balíček (Ruby karet)
    for i in range(5):
        # Kreslíme ruby na sebe s mírným posunem pro efekt
        screen.blit(card_back, (WIDTH // 2 - CARD_WIDTH // 2 - i * 3, HEIGHT // 2 - CARD_HEIGHT // 2 - i * 3))

    # Odhazovací balíček (Líc)
    # (Představujeme si, že na vrchu je načtená Bang! karta)
    screen.blit(bang_standard, (WIDTH // 2 + CARD_WIDTH + 10, HEIGHT // 2 - CARD_HEIGHT // 2))

    # Zóna 3: Plochy ostatních hráčů (Po stranách)
    # Hráč vpravo
    for i in range(3):
         screen.blit(card_back, (WIDTH - CARD_WIDTH - 20, 150 + i * 30))

    # Hráč vlevo
    for i in range(3):
         screen.blit(card_back, (20, 150 + i * 30))
         
    # Hráč nahoře
    for i in range(4):
         # Ruby karet
         screen.blit(card_back, (WIDTH // 2 - (4 * CARD_WIDTH // 2) + i * CARD_WIDTH + i * 10, 20))

    # --- 4. ZOBRAZENÍ SCÉNY ---
    pygame.display.flip()
    clock.tick(60) # Omezit FPS na 60

pygame.quit()