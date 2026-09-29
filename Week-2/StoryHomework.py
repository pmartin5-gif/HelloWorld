while True:
    user = input('Are you a student or a teacher?: ')
    if user == "student":
        type = "classmate"
        break
    if user == "teacher":
        type = "student"
        break
    else:  
        print("No need to get clever. Type student or teacher ")


while True:
    rumors = input('IxD Students are the coolest. True or False? ')
    if rumors == "True":
        break
    if rumors == "False":
        break
    else:  
        print("Real wise guy over here. Try just typing True or False ")


while True:
    goodName = input('Type in a really, really great name: ').strip()
    if goodName == "Peter":
        print("What a fantastic choice. Great job!")
        break
    else:
        print("Wow that's such a great name. But really I was looking for something a little more... awesome. Maybe try Peter ")

while True:
    number = int(input('What is your favorite number between 100 and 1,000? '))
    if 100 <= number <= 1000:
        break
    else:
        print("Enough with the shenanigans. Type a number between 100 and 1,000 ")


print('My favorite ', type, 'is', goodName, '. He is soooooooo good at coding. The rumors about him are', rumors, '. Sometimes I think about giving him', number, 'dollars.')