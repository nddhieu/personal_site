Feature: Writer GUI click-through
  As a reader of the storytelling app
  I want to open the site, enter as a guest, and play a scene
  So the team can verify the real GUI end to end, unattended

  @smoke
  Scenario: Guest reaches the play screen
    Given I open the login page
    When I continue as guest
    Then I see the library with the book "Accad and Kim"
    When I start the book "Accad and Kim"
    Then the play screen shows the opening scene
    Then the suggestions panel is collapsed
    When I open the suggestions panel
    Then the suggestion options are shown

  @full
  Scenario: Reader plays one turn and the diary remembers it
    Given I open the login page
    When I continue as guest
    Then I see the library with the book "Accad and Kim"
    When I start the book "Accad and Kim"
    Then the play screen shows the opening scene
    When I act "I take her hand and lead her inside, out of the rain."
    Then a new scene appears
    Then the suggestions panel is open with fresh suggestions
    When I reload the play screen
    Then the suggestions panel is collapsed
    When I open the suggestions panel
    Then the same suggestions are shown
    When I tap the first suggestion
    Then a new scene appears
    When I open the diary
    Then the diary has at least one entry
    When I tap the first diary entry
    Then the diary panel closes and its scene is highlighted

  @resume
  Scenario: Returning in a fresh tab resumes the same run
    Given I open the login page
    When I continue as guest
    Then I see the library with the book "Accad and Kim"
    When I start the book "Accad and Kim"
    Then the play screen shows the opening scene
    When I act "I take her hand and lead her inside, out of the rain."
    Then a new scene appears
    When I return in a fresh tab
    Then my earlier scenes are still there
