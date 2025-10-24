import cognee
import asyncio


async def main():
    # Add text to cognee
    await cognee.add("Cognee turns documents into AI memory.")
    
    # Generate the knowledge graph
    await cognee.cognify()
    
    # Add memory algorithms to the graph
    await cognee.memify()
    
    # Query the knowledge graph
    results = await cognee.search("What does cognee do?")
    
    # Display the results
    print("\n=== Results ===")
    for result in results:
        print(result)
    print("===============\n")


if __name__ == '__main__':
    asyncio.run(main())
