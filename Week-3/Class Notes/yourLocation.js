yourLocation

yourItem

yourFriends

// pseudocode if the player's location is the correct location (theLocation) AND the player has ther equired item (requiredItem) then the player can level up.

Logical AND &&

So, in Python

levelup = (yourLocation == theLocation and yourItem == requiredItem)
if (leveUp) {
    // do something
}

In javascript

)

Logical NOT (!)

If your player has not befriend the correct person, then you must go back and befriend them before leveling URLPattern.apply

javascript

let toggle = false;
toggle = !toggle;

Logical OR (||)

If we wanted to make the game easier, we could require only one of the two conditions to be true.

Python

(yourLocation is theLocation or neededFriend in yourFriends)

Jacascript
let levelUp = (
    yourLocation == theLocation || yourFriends.includes(neededFriend)
)

If statements

Python

if (yourLocation == theLocation):
    print("you are in the right place")

javascript

x = 1
y = 2
if(x < y):
    print("x is indeed less than y")

if not(x <y):
    print("x is not greater than y")