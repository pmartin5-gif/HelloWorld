
# DEEP DEEP FOREST  (Rich version)
# Python 3
#
# This is the "fixed" deep deep forest game with one new import: Rich.
# Rich is a library that makes terminal programs colorful. The game logic
# is exactly the same. Only the printing and the asking have changed.
#
# Install it once with:   pip3 install rich
# Run the game with:      python3 deep-deep-forest-rich.py
#
# Look for comments that start with "RICH:" to see each new thing.
#
# Scroll to the bottom and look for the main() function, that is
# where the program logic starts.

import random # random numbers (https://docs.python.org/3/library/random.html)
import time   # so we can pause for dramatic effect

# RICH: these are the pieces of Rich we use in this game
from rich.console import Console      # replaces print()
from rich.prompt import Prompt, Confirm # replaces input()
from rich.panel import Panel          # a box around text
from rich.table import Table          # rows and columns
from rich.text import Text            # plain text with a style, no markup

# RICH: a Console is the thing we print with. Make one and reuse it.
console = Console()

# an object describing our player
player = {
    "Energy Level": 12,
    "Coffees Drank" : 0,
    "Homework Assignments Remaining" : 3,
    "Work Tasks Remaining" : 3,
    "Turn number": 0,
    "Naps taken": 0
}


# all of the ASCII art uses RAW strings (the r before the quote).
# without the r, python reads \_ and \/ as broken escape sequences.
# each picture is one multi-line string instead of a stack of print()s.
art = {
    "success": r"""
----------------------------------------------------------------------------------
 _______  __   __  _______  _______  _______  _______  _______ 
|       ||  | |  ||       ||       ||       ||       ||       |
|  _____||  | |  ||       ||       ||    ___||  _____||  _____|
| |_____ |  |_|  ||       ||       |   |___ | |_____ | |_____ |
|_____  ||       ||     __||    ___||    ___||_____  ||_____  |
 _____| ||       ||   | __ |   |___ |   |___  _____| | _____| |
|_______||_______||_______||_______||_______||_______||_______|


                                     \ o /   Hooray!
                                      | |    (We did it!)
                                     /   \    
                                   .-------. 
                                  /         \
                                 | (|o|o|)   |
                                  \_  v  _/  
                                   /  --- \  
                                  / |     | \
                                 (_ |     | _)
----------------------------------------------------------------------------------
""",
    "failBoth": r"""
----------------------------------------------------------------------------------
 _______  _______  ___  ___      _______  ______   
|       ||   _   ||   ||   |    |       ||      |  
|    ___||  |_|  ||   ||   |    |    ___||  _    | 
|   |___ |       ||   ||   |    |   |___ | | |   | 
|    ___||       ||   ||   |___ |    ___|| |_|   | 
|   |    |   _   ||   ||_______||   |___ |       | 
|___|    |__| |__||___||_______||_______||______|  


                                   .------. 
                                  /        \
                                 | (|x|x|) |   (Gulp... gulp...)
                                  \_  -  _/      /
                                   / --- \   ___|_
                                  / |   _ |  |Vod|
                                 (_ |  | ||  |ka |
                                       |_||  |___|
----------------------------------------------------------------------------------
""",
    "failSchool": r"""
       __             ___
      // )    ___--""    "-.
 \ |,"( /`--""              `.  
  \/ o                        \
  (   _.-.              ,'"    ;  
   |\"   /`. \  ,      /       |
   | \  ' .'`.; |      |       \.______________________________
     _-'.'    | |--..,,,\_    \________------------""""""""""""
    '''"   _-'.'       ___"-   )
          '''"        '''---~""
""",
# credit for the rat to Bernhard Rieder

    "failWork": r"""
         @\_______/@
        @|XXXXXXXX |
       @ |X||    X |
      @  |X||    X |
     @   |XXXXXXXX |
    @    |X||    X |             V
   @     |X||   .X |
  @      |X||.  .X |                      V
 @      |%XXXXXXXX%||
@       |X||  . . X||
        |X||   .. X||                               @     @
        |X||  .   X||.                              ||====%
        |X|| .    X|| .                             ||    %
        |X||.     X||   .                           ||====%
       |XXXXXXXXXXXX||     .                        ||    %
       |XXXXXXXXXXXX||         .                 .  ||====% .
       |XX|        X||                .        .    ||    %  .
       |XX|        X||                   .          ||====%   .
       |XX|        X||              .          .    ||    %     .
       |XX|======= X||============================+ || .. %  ........
===== /            X||                              ||    %
                   X||           /)                 ||    %
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# Nina Butorac
""",
    "title": r"""
----------------------------------------------------------------------------------
  ______   ___      _______  _______  _______  __  
 /  ____| |   |    |  _____||  _____||  ___  ||  | 
|  |____  |   |    | |____  | |____  | |___| ||  | 
 \____  \ |   |    |  ____| |  ____| |  _____/|__| 
 ____|  | |   |___ | |____  | |____  | |      __   
|______/  |_______||_______||_______||_|     |__|  

  ______   ___      _______  _______  _______  __  
 /  ____| |   |    |  _____||  _____||  ___  ||  | 
|  |____  |   |    | |____  | |____  | |___| ||  | 
 \____  \ |   |    |  ____| |  ____| |  _____/|__| 
 ____|  | |   |___ | |____  | |____  | |      __   
|______/  |_______||_______||_______||_|     |__|  

 ______    _______  _______  ___   ______           _____
|   _  \  |   _   ||   _   ||   | |  ____|         /|||||\
|  |_)  | |  | |  ||  |_|  ||   | | |____          (|o|o|)
|   _  <  |  | |  ||   _  < |   | |____  \         _\ - / _(*yawn*)
|  |_)  | |  |_|  ||  | |  ||   |  ____|  |      /  `---'  \
|______/  |_______||__| |__||___| |______/      / |       | \
----------------------------------------------------------------------------------
""",
}

def printGraphic(name, color="white", caption=""):
    # RICH: Panel draws a box around anything. Text() keeps the ASCII art
    # as plain characters, because Rich would otherwise read the [ ] in the
    # art as styling instructions.
    picture = Text(art[name], style=color)
    console.print(Panel(picture, title=caption, expand=False, border_style=color))

def pause():
    # RICH: console.input() is input() with colors. [dim] makes it faded.
    console.input("[dim]press enter >[/] ")

def rollDice(minNum, maxNum):
    # any time a chance of something might happen, let's roll a die

    # RICH: console.status() shows an animated spinner while we wait.
    # time.sleep(2) pauses the program for 2 seconds. Try changing the number,
    # or the spinner= name ("dots", "bouncingBall", "moon", "earth", "clock"...).
    # see them all with:  python3 -m rich.spinner
    with console.status("[bold yellow]rolling the dice...[/]", spinner="bouncingBall"):
        time.sleep(2)

    result = random.randint(minNum, maxNum)

    # RICH: text inside [square brackets] is markup. [bold cyan]...[/] colors
    # just that part of the line. str() still turns numbers into strings.
    console.print("You roll a [bold cyan]" + str(result) + "[/] out of " + str(maxNum))

    # if the roll was too low we get a few more tries.
    # we have to RETURN the result of the recursive call, otherwise
    # the new roll gets thrown away and the old (bad) roll is used.

    return result

def success():
    printGraphic("success")
    print("Congralations. You finished it all! Sleep Sleep Boris!!")
    return

def failBoth():
    printGraphic("failBoth")
    print("Oh no! You fell asleep without completing your homework or your work tasks!")
    print("You lose your job and get kicked out of school.")
    print("You become an alcoholic.")
    return

def failSchool():
    printGraphic("failSchool")
    print("Oh no! You fell asleep without completing your homework!")
    print("Now you will be poor forever and have to live with rats!")
    return

def failWork():
    printGraphic("failWork")
    print("Oh no! You fell asleep without completing your work tasks!")
    print("You lose your job and have to live under a bridge.")
    return


def gameLoop():
    while True:
        console.print("Energy Remaining: ", player["Energy Level"], " hours")
        console.print("Homework Assignments: ", player["Homework Assignments Remaining"])
        console.print("Work Tasks: ", player["Work Tasks Remaining"])

        print("What do you want to do next?")

        # Game continues - Standard state
        if (player["Energy Level"] >= 0) and (player["Homework Assignments Remaining"] > 0) and (player["Work Tasks Remaining"] > 0):
            print(" do a homework assignment\n", "do a task for work\n", "drink coffee\n", "take a nap\n", "go to sleep\n")

        # Game continues - Homework assignments completed
        elif (player["Energy Level"] >= 0) and (player["Homework Assignments Remaining"] == 0) and (player["Work Tasks Remaining"] > 0):
            print(" do a task for work\n", "drink coffee\n", "take a nap\n", "go to sleep\n")

        # Game continues - Work tasks completed
        elif (player["Energy Level"] >= 0) and (player["Homework Assignments Remaining"] > 0) and (player["Work Tasks Remaining"] == 0):
            print(" do a homework assignment\n", "drink coffee\n", "take a nap\n", "go to sleep\n")

        # Success!
        elif (player["Energy Level"] >= 0) and (player["Homework Assignments Remaining"] == 0) and (player["Work Tasks Remaining"] == 0):
            return "success" # game win screen

        # Game fails - Nothing complete
        elif (player["Energy Level"] <= 0) and (player["Homework Assignments Remaining"] > 0) and (player["Work Tasks Remaining"] > 0):
            return "failBoth" # double failure. drug addiction

        # Game fails - Work Complete
        elif (player["Energy Level"] <= 0) and (player["Homework Assignments Remaining"] > 0) and (player["Work Tasks Remaining"] == 0):
            return "failSchool" # fail school. be poor, live with rats

        # Game fails - School complete
        elif (player["Energy Level"] <= 0) and (player["Homework Assignments Remaining"] == 0) and (player["Work Tasks Remaining"] > 0):
            return "failWork" # fail work. live under bridge

        pcmd = Prompt.ask() # user input

        # homework assignment
        if pcmd == "do a homework assignment":
            player["Energy Level"] -= 3
            player["Homework Assignments Remaining"] -= 1
            player["Turn number"] += 1
            console.print("You complete a homework assignment. It takes about three hours.")
            pause()

            continue

        # work task
        if pcmd == "do a task for work":
            player["Energy Level"] -= 3
            player["Work Tasks Remaining"] -= 1
            player["Turn number"] += 1
            console.print("You complete a work task. It takes about three hours.")
            pause()

            continue

        # Drink Coffee
        if pcmd == "drink coffee" and (player["Coffees Drank"] == 0):
            player["Energy Level"] += 2
            player["Turn number"] += 1
            console.print("You drink some coffee. Whew! Feels good.")
            pause()

            continue  

        # Coffe #2
        elif pcmd == "drink coffee" and (player["Coffees Drank"] == 1):
            player["Energy Level"] += 1
            player["Turn number"] += 1
            console.print("You drink some coffee. The second cup doesn't hit as hard...")
            pause()

            continue  

        elif pcmd == "drink coffee" and (player["Coffees Drank"] == 2):
            player["Energy Level"] += 0
            player["Turn number"] += 1
            console.print("You drink some coffee. You don't even feel it...")
            pause()

            continue  

        # take a nap - not tired yet
        if pcmd == "take a nap" and (player["Turn number"] < 3):
            player["Turn number"] += 1
            console.print("You're not even tired yet.")
            pause()

            continue

        # take a nap - roll dice
        if pcmd == "take a nap" and (player["Turn number"] > 3):
            console.print("Are you sure you want to take a nap? You're already pretty tired...")
            pcmd = input("y/n: ")

            if pcmd == "N":
                continue

            if pcmd == "Y":
                roll = rollDice(0, 12)

            if roll > player["Energy Level"] or player["Naps taken"] > 0:
                player["Energy Level"] -= 12

                continue

            if roll <= player["Energy Level"]:
                player["Energy Level"] += 3
                player["Naps taken"] += 1
                player["Turn number"] += 1
                console.print("You have the perfect nap. You feel refreshed.")
                pause()

                continue  

            
                

        # Go to sleep
        if pcmd == "go to sleep":
            player["Energy Level"] -= 12

            continue  


def introStory():

    console.print(
        "Another day in the life of Boris, full-time employee and grad student.\n"
        "NOT from the makers of deep deep forest."
    )

    pause()

    console.print(
        "Today you've got 3 work tasks and 3 homework assignments."
        "But you only have enough energy to stay up for 12 hours!\n"
        "Try to complete all of your work tasks and school assignments before you run out of energy.\n"
        "But be careful!.\n"
        "Failure has major consequences.\n"
    )

    # ask over and over until the player chooses yes
    while True:
        if Confirm.ask("Ready to start?"):
            console.print("Great. Let's begin")
            pause()
            return "game"

        console.print("No? ... [dim]That doesn't work here.[/]")
        pause()


# main! most programs start with this.
# this is the "game loop": each room function RETURNS the name of the next
# room, and this loop keeps calling rooms until one of them returns "quit".
def main():
    printGraphic("title", "bold green") # call the function to print an image

    state = "intro"
    while state != "quit":
        if state == "intro":
            state = introStory()
        if state == "game":
            state = gameLoop()
        elif state == "failBoth":
            state = failBoth()
        elif state == "failWork":
            state = failWork()
        elif state == "failSchool":
            state = failSchool()
        elif state == "success":
            state = success()
        else:
            console.print("[red]Unknown room: " + str(state) + "[/]")
            state = "quit"

main() # this is the first thing that happens

