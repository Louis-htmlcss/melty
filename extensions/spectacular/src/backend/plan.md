class Conversation:

- joules: Joule[]

class Joule:

- message: string
- author: string
- commit: str
- context_uris: uri[]

class PseudoCommit:

- files: File[]
- commit: str

#### addJoule(conversation) -> Joule

    """Does NOT handle git at all"""
    workspaceState = conversation.getWorkspaceState()

    # TODO 100: Add a loop here to try to correct the response if it's not good yet

    # TODO 300 (abstraction over 100 and 200): Constructing a unit of work might require multiple LLM steps: find context, make diff, make corrections.
    # We can try each step multiple times. All attempts should be represented by a tree. We pick one leaf to respond with.

    prompt =
        - systemPrompt()
        - encodeUserSystemInfo()  # leave this out to start
        - encodeRepoMap(workspaceState)  # leave this out to start # TODO: what does this look like? why don't we see it?
        - encodeFiles(workspaceState)
        - encodeConversation(conversation)
        - promptsForMessageDecoder()
        - promptsForDiffDecoder()

    # TODO 200: get five responses, pick the best one with pickResponse

    response = claudePlus(prompt)

    message = decodeMessage(response)
    updatedFiles = decodeDiff(workspaceState, response)

    return Joule(message, updatedFiles)

#### claudePlus

todo: string responses together
MVP: we use normal Claude

#### encodeFiles

todo: pick a good fence
MVP: use ```
use instruction to Claude from Aider
use relative paths

#### encodeConversation

MVP: ignore diffs

#### decodeMessage

- Anything outside SEARCH/REPLACE gets concatenated into message
- Diffs use search/replace format

#### decodeDiff(workspaceState: File[], response) -> File[]

MVP: only apply diffs if they're perfect

#### pickResponse

- does the diff apply?
- does it lint?
- does it compile?
- does it pass tests?
- what does our judge model say about it?

## Notes

**potential system for handling file context**

- Conversation keeps track of ALL files in the repo (because it's just like git. It's tied to git.)
- FilesToEmphasize =~= aider's "in context" files
  - It's a bit looser than Aider -- at some point, AI might decide to look in another file?
  - FilesToEmphasize is what gets initially loaded into context.

should I be using git to store all this stuff?
